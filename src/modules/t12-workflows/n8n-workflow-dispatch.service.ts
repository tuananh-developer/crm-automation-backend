import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  OutboxEvent,
  OutboxEventStatus,
  OutboxTransport,
} from '../../infrastructure/rabbitmq/entities/outbox-event.entity.js';

export type N8nWebhookKey =
  | 'N8N_WF10_WEBHOOK_URL'
  | 'N8N_WF11_WEBHOOK_URL'
  | 'N8N_WF12_WEBHOOK_URL'
  | 'N8N_WF14_WEBHOOK_URL';

@Injectable()
export class N8nWorkflowDispatchService {
  /**
   * Persist the dispatch intent in the same transaction as its WorkflowRun.
   * The OutboxPublisher owns delivery, retry and recovery after process restarts.
   */
  async enqueue(
    manager: EntityManager,
    workflowUrlKey: N8nWebhookKey,
    workflowPath: string,
    payload: Record<string, unknown>,
  ): Promise<OutboxEvent> {
    const allowedPaths: Record<N8nWebhookKey, string> = {
      N8N_WF10_WEBHOOK_URL: 'internal/t12-wf10-next-best-action',
      N8N_WF11_WEBHOOK_URL: 'internal/t12-wf11-sales-meeting',
      N8N_WF12_WEBHOOK_URL: 'internal/t12-wf12-quote-proposal',
      N8N_WF14_WEBHOOK_URL: 't12-wf14-customer-feedback',
    };
    if (allowedPaths[workflowUrlKey] !== workflowPath) {
      throw new InternalServerErrorException(
        'Workflow dispatch destination is not allowlisted',
      );
    }

    const repository = manager.getRepository(OutboxEvent);
    const record = repository.create({
      eventType: 'n8n.workflow.dispatch.requested',
      exchange: '',
      routingKey: '',
      transport: OutboxTransport.HTTP,
      destination: workflowUrlKey,
      destinationPath: workflowPath,
      payload,
      status: OutboxEventStatus.PENDING,
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      publishedAt: null,
      lockedUntil: null,
      lockToken: null,
    });
    return repository.save(record);
  }
}
