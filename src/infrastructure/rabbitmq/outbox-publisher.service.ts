import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertUrlUsesScheme } from '../../config/environment.validation.js';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { WorkflowRun } from '../../modules/workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../../modules/workflow/enums/workflow.enum.js';
import { RabbitMQService } from './rabbitmq.service.js';
import {
  OutboxEvent,
  OutboxEventStatus,
  OutboxTransport,
} from './entities/outbox-event.entity.js';

interface ClaimedEvent {
  id: string;
  eventType: string;
  exchange: string;
  routingKey: string;
  transport: OutboxTransport;
  destination: string | null;
  destinationPath: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  lockToken: string;
}

class PermanentOutboxError extends Error {}

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbitmq: RabbitMQService,
    private readonly config: ConfigService,
  ) {}

  @Interval(1000)
  async publishPendingEvents(): Promise<void> {
    if (this.running || !this.dataSource.isInitialized) return;
    this.running = true;
    try {
      const sql = [
        'WITH candidates AS (SELECT id FROM outbox_events',
        "WHERE (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())) OR (status = 'PROCESSING' AND locked_until <= NOW())",
        'ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED)',
        "UPDATE outbox_events AS event SET status = 'PROCESSING', attempts = event.attempts + 1, locked_until = NOW() + INTERVAL '2 minutes', lock_token = gen_random_uuid()",
        'FROM candidates WHERE event.id = candidates.id',
        'RETURNING event.id, event.event_type AS "eventType", event.exchange, event.routing_key AS "routingKey", event.transport, event.destination, event.destination_path AS "destinationPath", event.payload, event.attempts, event.lock_token AS "lockToken"',
      ].join(' ');
      const queryResult: unknown = await this.dataSource.transaction(
        (manager) => manager.query(sql, [25]),
      );

      if (!Array.isArray(queryResult)) {
        throw new Error('Unexpected PostgreSQL outbox claim result');
      }

      // TypeORM PostgreSQL UPDATE returns [rows, affectedCount].
      // SELECT-style results are returned directly as rows.
      const events: ClaimedEvent[] = Array.isArray(queryResult[0])
        ? (queryResult[0] as ClaimedEvent[])
        : (queryResult as ClaimedEvent[]);
      const outcomes = await Promise.allSettled(
        events.map((event) => this.publishOne(event)),
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          const message =
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason);
          this.logger.error(`Outbox event processing failed: ${message}`);
        }
      }
    } catch (error) {
      this.logger.error(
        'Outbox polling failed: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      this.running = false;
    }
  }

  private async publishOne(event: ClaimedEvent): Promise<void> {
    try {
      if (event.transport === OutboxTransport.HTTP) {
        await this.publishWebhook(event);
      } else {
        await this.rabbitmq.publishOutboxEvent(event);
      }

      // Commit the delivery acknowledgement and WorkflowRun transition
      // together. A stale worker cannot acknowledge a lease it no longer owns.
      await this.dataSource.transaction(async (manager) => {
        const acknowledged = await manager.getRepository(OutboxEvent).update(
          { id: event.id, lockToken: event.lockToken },
          {
            status: OutboxEventStatus.PUBLISHED,
            publishedAt: new Date(),
            lockedUntil: null,
            lockToken: null,
            nextAttemptAt: null,
            lastError: null,
          },
        );
        if ((acknowledged.affected ?? 0) !== 1) return;

        if (event.transport === OutboxTransport.HTTP) {
          const workflowRunId = event.payload.workflowRunId;
          if (typeof workflowRunId === 'string') {
            await manager
              .getRepository(WorkflowRun)
              .update(
                { id: workflowRunId, status: WorkflowStatus.PENDING },
                { status: WorkflowStatus.RUNNING },
              );
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const terminal =
        error instanceof PermanentOutboxError || event.attempts >= 10;
      const delay = Math.min(
        60_000 * 2 ** Math.min(event.attempts - 1, 6),
        3_600_000,
      );
      await this.dataSource.transaction(async (manager) => {
        const updated = await manager.getRepository(OutboxEvent).update(
          { id: event.id, lockToken: event.lockToken },
          {
            status: terminal
              ? OutboxEventStatus.FAILED
              : OutboxEventStatus.PENDING,
            lastError: message.slice(0, 4000),
            nextAttemptAt: terminal ? null : new Date(Date.now() + delay),
            lockedUntil: null,
            lockToken: null,
          },
        );
        if ((updated.affected ?? 0) !== 1) return;

        if (terminal && event.transport === OutboxTransport.HTTP) {
          const workflowRunId = event.payload.workflowRunId;
          if (typeof workflowRunId === 'string') {
            const failedRun = await manager.getRepository(WorkflowRun).update(
              {
                id: workflowRunId,
                status: WorkflowStatus.PENDING,
              },
              {
                status: WorkflowStatus.FAILED,
                finishedAt: new Date(),
                errorMessage: `n8n dispatch failed: ${message}`.slice(0, 1000),
              },
            );

            if (
              (failedRun.affected ?? 0) === 1 &&
              event.destination === 'N8N_WF11_WEBHOOK_URL'
            ) {
              await manager.query(
                `UPDATE sales_meetings
                 SET status = 'FAILED', updated_at = NOW()
                 WHERE workflow_run_id = $1 AND status = 'PROCESSING'`,
                [workflowRunId],
              );
            }
          }
        }
      });
      this.logger[terminal ? 'error' : 'warn'](
        `Outbox event ${event.id} failed: ${message}`,
      );
    }
  }

  private async publishWebhook(event: ClaimedEvent): Promise<void> {
    const allowedDestinations = [
      'N8N_WF10_WEBHOOK_URL',
      'N8N_WF11_WEBHOOK_URL',
      'N8N_WF12_WEBHOOK_URL',
    ] as const;
    if (
      !event.destination ||
      !allowedDestinations.includes(
        event.destination as (typeof allowedDestinations)[number],
      ) ||
      !event.destinationPath
    ) {
      throw new PermanentOutboxError('Invalid n8n outbox destination');
    }

    const secret =
      this.config.get<string>('N8N_API_KEY') ||
      this.config.get<string>('N8N_WEBHOOK_SECRET');
    if (!secret) {
      throw new PermanentOutboxError('n8n dispatch secret is not configured');
    }

    const configuredUrl = this.config.get<string>(event.destination);
    const baseUrl = this.config.get<string>('N8N_BASE_URL');
    const url =
      configuredUrl ||
      (baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/webhook/${event.destinationPath.replace(/^\//, '')}`
        : undefined);
    if (!url) {
      throw new PermanentOutboxError(
        `Neither ${event.destination} nor N8N_BASE_URL is configured`,
      );
    }

    const nodeEnv = (
      this.config.get<string>('NODE_ENV') || process.env.NODE_ENV || ''
    )
      .trim()
      .toLowerCase();
    if (nodeEnv === 'production') {
      try {
        assertUrlUsesScheme(url, 'https:', event.destination);
      } catch (error) {
        throw new PermanentOutboxError(
          error instanceof Error ? error.message : String(error),
        );
      }

      if (
        typeof event.payload.transcript === 'string' &&
        (this.config.get<string>('TRANSCRIPT_EXTERNAL_PROCESSING_ENABLED') || '')
          .trim()
          .toLowerCase() !== 'true'
      ) {
        throw new PermanentOutboxError(
          'External transcript processing is disabled by production policy',
        );
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        // Do not forward the n8n API key through an untrusted redirect target.
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-N8N-API-KEY': secret,
          'Idempotency-Key':
            typeof event.payload.workflowRunId === 'string'
              ? event.payload.workflowRunId
              : event.id,
        },
        body: JSON.stringify(event.payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }

    if (!response.ok) {
      const message = `n8n webhook returned HTTP ${response.status}`;
      if (
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 425, 429].includes(response.status)
      ) {
        throw new PermanentOutboxError(message);
      }
      throw new Error(message);
    }
  }
}
