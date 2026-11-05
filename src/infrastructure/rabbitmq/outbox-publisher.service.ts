import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { RabbitMQService } from './rabbitmq.service.js';
import { OutboxEvent, OutboxEventStatus } from './entities/outbox-event.entity.js';

interface ClaimedEvent { id: string; eventType: string; exchange: string; routingKey: string; payload: Record<string, unknown>; attempts: number; lockToken: string; }

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);
  private running = false;
  constructor(private readonly dataSource: DataSource, private readonly rabbitmq: RabbitMQService) {}

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
        'RETURNING event.id, event.event_type AS "eventType", event.exchange, event.routing_key AS "routingKey", event.payload, event.attempts, event.lock_token AS "lockToken"'
      ].join(' ');
      const events = await this.dataSource.transaction((manager) =>
        manager.query<ClaimedEvent[]>(sql, [25]),
      );
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
      this.logger.error('Outbox polling failed: ' + (error instanceof Error ? error.message : String(error)));
    } finally { this.running = false; }
  }

  private async publishOne(event: ClaimedEvent): Promise<void> {
    const repository = this.dataSource.getRepository(OutboxEvent);
    try {
      await this.rabbitmq.publishOutboxEvent(event);
      await repository.update({ id: event.id, lockToken: event.lockToken }, { status: OutboxEventStatus.PUBLISHED, publishedAt: new Date(), lockedUntil: null, lockToken: null, nextAttemptAt: null, lastError: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const terminal = event.attempts >= 10;
      const delay = Math.min(60000 * (2 ** Math.min(event.attempts - 1, 6)), 3600000);
      await repository.update({ id: event.id, lockToken: event.lockToken }, { status: terminal ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING, lastError: message.slice(0, 4000), nextAttemptAt: terminal ? null : new Date(Date.now() + delay), lockedUntil: null, lockToken: null });
      this.logger[terminal ? 'error' : 'warn']('Outbox event ' + event.id + ' failed: ' + message);
    }
  }
}
