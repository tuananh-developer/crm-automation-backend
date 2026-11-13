import { DataSource, Repository } from 'typeorm';
import { OutboxPublisher } from './outbox-publisher.service.js';
import {
  OutboxEvent,
  OutboxEventStatus,
  OutboxTransport,
} from './entities/outbox-event.entity.js';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service.js';
import { WorkflowRun } from '../../modules/workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../../modules/workflow/enums/workflow.enum.js';

describe('OutboxPublisher', () => {
  const event = {
    id: 'outbox-1',
    eventType: 'lead.created',
    exchange: 'crm.events',
    routingKey: 'lead.created',
    payload: {
      eventId: 'event-1',
      eventType: 'lead.created',
      data: { leadId: 'lead-1' },
    },
    attempts: 1,
    lockToken: 'lock-1',
    transport: OutboxTransport.RABBITMQ,
    destination: null,
    destinationPath: null,
  };

  let publisher: OutboxPublisher;
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let repository: jest.Mocked<Partial<Repository<OutboxEvent>>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let rabbitmq: jest.Mocked<Partial<RabbitMQService>>;

  beforeEach(() => {
    repository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager = {
      query: jest.fn().mockResolvedValue([[{ ...event }], 1]),
      getRepository: jest.fn().mockReturnValue(repository),
    };
    dataSource = {
      isInitialized: true,
      transaction: jest
        .fn()
        .mockImplementation(
          (callback: (value: typeof manager) => Promise<unknown>) =>
            callback(manager),
        ),
      getRepository: jest.fn().mockReturnValue(repository),
    };
    rabbitmq = {
      publishOutboxEvent: jest.fn().mockResolvedValue(undefined),
    };
    publisher = new OutboxPublisher(
      dataSource as DataSource,
      rabbitmq as RabbitMQService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
  });

  it('does not process events when the outbox claim returns no rows', async () => {
    manager.query.mockResolvedValueOnce([[], 0]);

    await publisher.publishPendingEvents();

    expect(rabbitmq.publishOutboxEvent).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('claims pending events and marks them published after broker confirmation', async () => {
    await publisher.publishPendingEvents();

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      [25],
    );
    expect(rabbitmq.publishOutboxEvent).toHaveBeenCalledWith(event);
    expect(repository.update).toHaveBeenCalledWith(
      { id: event.id, lockToken: event.lockToken },
      expect.objectContaining({
        status: OutboxEventStatus.PUBLISHED,
        publishedAt: expect.any(Date),
        lockedUntil: null,
        lockToken: null,
      }),
    );
  });

  it('dispatches allowlisted HTTP outbox events and starts the workflow only after acknowledgement', async () => {
    const workflowRunId = '11111111-1111-1111-1111-111111111111';
    const httpEvent = {
      ...event,
      transport: OutboxTransport.HTTP,
      destination: 'N8N_WF10_WEBHOOK_URL',
      destinationPath: 'internal/t12-wf10-next-best-action',
      payload: { workflowRunId, entityType: 'Lead', entityId: 'lead-1' },
    };
    manager.query.mockResolvedValueOnce([httpEvent]);
    const workflowRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager.getRepository.mockImplementation((entity: unknown) =>
      entity === WorkflowRun ? workflowRepository : repository,
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'N8N_WF10_WEBHOOK_URL') {
          return 'https://n8n.example/webhook/internal/t12-wf10-next-best-action';
        }
        if (key === 'N8N_API_KEY') return 'test-n8n-secret';
        return undefined;
      }),
    };
    publisher = new OutboxPublisher(
      dataSource as DataSource,
      rabbitmq as RabbitMQService,
      config as unknown as ConfigService,
    );

    await publisher.publishPendingEvents();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://n8n.example/webhook/internal/t12-wf10-next-best-action',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-N8N-API-KEY': 'test-n8n-secret',
          'Idempotency-Key': workflowRunId,
        }),
        body: JSON.stringify(httpEvent.payload),
      }),
    );
    expect(workflowRepository.update).toHaveBeenCalledWith(
      { id: workflowRunId, status: WorkflowStatus.PENDING },
      { status: WorkflowStatus.RUNNING },
    );
    expect(rabbitmq.publishOutboxEvent).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('dispatches allowlisted WF09 HTTP outbox events and updates WorkflowRun to RUNNING', async () => {
    const workflowRunId = '22222222-2222-2222-2222-222222222222';
    const httpEvent = {
      ...event,
      transport: OutboxTransport.HTTP,
      destination: 'N8N_WF09_WEBHOOK_URL',
      destinationPath: 'internal/t12-wf09-conversation-summarizer',
      payload: {
        workflowRunId,
        transcriptId: 'transcript-1',
        redactedContent: 'Hello',
      },
    };
    manager.query.mockResolvedValueOnce([httpEvent]);
    const workflowRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager.getRepository.mockImplementation((entity: unknown) =>
      entity === WorkflowRun ? workflowRepository : repository,
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'N8N_WF09_WEBHOOK_URL') {
          return 'https://n8n.example/webhook/internal/t12-wf09-conversation-summarizer';
        }
        if (key === 'N8N_API_KEY') return 'test-n8n-secret';
        return undefined;
      }),
    };
    publisher = new OutboxPublisher(
      dataSource as DataSource,
      rabbitmq as RabbitMQService,
      config as unknown as ConfigService,
    );

    await publisher.publishPendingEvents();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://n8n.example/webhook/internal/t12-wf09-conversation-summarizer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-N8N-API-KEY': 'test-n8n-secret',
          'Idempotency-Key': workflowRunId,
        }),
        body: JSON.stringify(httpEvent.payload),
      }),
    );
    expect(workflowRepository.update).toHaveBeenCalledWith(
      { id: workflowRunId, status: WorkflowStatus.PENDING },
      { status: WorkflowStatus.RUNNING },
    );
    fetchSpy.mockRestore();
  });

  it('falls back to N8N_BASE_URL and derives matching WF09 webhook path when N8N_WF09_WEBHOOK_URL is not set', async () => {
    const workflowRunId = '33333333-3333-3333-3333-333333333333';
    const httpEvent = {
      ...event,
      transport: OutboxTransport.HTTP,
      destination: 'N8N_WF09_WEBHOOK_URL',
      destinationPath: 'internal/t12-wf09-conversation-summarizer',
      payload: { workflowRunId, transcriptId: 'transcript-fallback' },
    };
    manager.query.mockResolvedValueOnce([httpEvent]);
    const workflowRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager.getRepository.mockImplementation((entity: unknown) =>
      entity === WorkflowRun ? workflowRepository : repository,
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'N8N_WF09_WEBHOOK_URL') return undefined; // NOT set in env
        if (key === 'N8N_BASE_URL') return 'http://localhost:5678';
        if (key === 'N8N_API_KEY') return 'test-n8n-secret';
        return undefined;
      }),
    };
    publisher = new OutboxPublisher(
      dataSource as DataSource,
      rabbitmq as RabbitMQService,
      config as unknown as ConfigService,
    );

    await publisher.publishPendingEvents();

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:5678/webhook/internal/t12-wf09-conversation-summarizer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-N8N-API-KEY': 'test-n8n-secret',
          'Idempotency-Key': workflowRunId,
        }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('does not send production webhooks over plaintext HTTP', async () => {
    const workflowRunId = '11111111-1111-1111-1111-111111111111';
    const httpEvent = {
      ...event,
      transport: OutboxTransport.HTTP,
      destination: 'N8N_WF10_WEBHOOK_URL',
      destinationPath: 'internal/t12-wf10-next-best-action',
      payload: { workflowRunId, entityType: 'Lead', entityId: 'lead-1' },
    };
    manager.query.mockResolvedValueOnce([httpEvent]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'N8N_WF10_WEBHOOK_URL') return 'http://n8n.example/webhook';
        if (key === 'N8N_API_KEY') return 'test-n8n-secret';
        return undefined;
      }),
    };
    publisher = new OutboxPublisher(
      dataSource as DataSource,
      rabbitmq as RabbitMQService,
      config as unknown as ConfigService,
    );

    await publisher.publishPendingEvents();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      { id: httpEvent.id, lockToken: httpEvent.lockToken },
      expect.objectContaining({
        status: OutboxEventStatus.FAILED,
        lastError: expect.stringContaining('must use https'),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('blocks production transcript dispatch until external processing is explicitly enabled', async () => {
    const workflowRunId = '11111111-1111-1111-1111-111111111111';
    const httpEvent = {
      ...event,
      transport: OutboxTransport.HTTP,
      destination: 'N8N_WF11_WEBHOOK_URL',
      destinationPath: 'internal/t12-wf11-sales-meeting',
      payload: { workflowRunId, transcript: 'Sensitive meeting transcript' },
    };
    manager.query.mockResolvedValueOnce([httpEvent]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'N8N_WF11_WEBHOOK_URL') return 'https://n8n.example/webhook';
        if (key === 'N8N_API_KEY') return 'test-n8n-secret';
        return undefined;
      }),
    };
    publisher = new OutboxPublisher(
      dataSource as DataSource,
      rabbitmq as RabbitMQService,
      config as unknown as ConfigService,
    );

    await publisher.publishPendingEvents();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      { id: httpEvent.id, lockToken: httpEvent.lockToken },
      expect.objectContaining({
        status: OutboxEventStatus.FAILED,
        lastError: expect.stringContaining('disabled by production policy'),
      }),
    );
    fetchSpy.mockRestore();
  });

  it.each([
    { attempts: 1, delayMs: 60_000 },
    { attempts: 2, delayMs: 5 * 60_000 },
    { attempts: 3, delayMs: 15 * 60_000 },
  ])(
    'schedules attempt $attempts retry according to the 1/5/15-minute policy',
    async ({ attempts, delayMs }) => {
      manager.query.mockResolvedValueOnce([{ ...event, attempts }]);
      (rabbitmq.publishOutboxEvent as jest.Mock).mockRejectedValueOnce(
        new Error('broker unavailable'),
      );

      const before = Date.now();
      await publisher.publishPendingEvents();

      const update = (repository.update as jest.Mock).mock.calls[0][1] as {
        status: OutboxEventStatus;
        lastError: string;
        nextAttemptAt: Date;
      };
      expect(update.status).toBe(OutboxEventStatus.PENDING);
      expect(update.lastError).toBe('broker unavailable');
      expect(update.nextAttemptAt).toBeInstanceOf(Date);
      expect(update.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
        before + delayMs,
      );
      expect(update.nextAttemptAt.getTime()).toBeLessThanOrEqual(
        Date.now() + delayMs,
      );
    },
  );

  it('moves an event to terminal failure on the fourth total attempt', async () => {
    manager.query.mockResolvedValueOnce([{ ...event, attempts: 4 }]);
    (rabbitmq.publishOutboxEvent as jest.Mock).mockRejectedValueOnce(
      new Error('broker unavailable'),
    );

    await publisher.publishPendingEvents();

    expect(repository.update).toHaveBeenCalledWith(
      { id: event.id, lockToken: event.lockToken },
      expect.objectContaining({
        status: OutboxEventStatus.FAILED,
        lastError: 'broker unavailable',
        nextAttemptAt: null,
        lockedUntil: null,
        lockToken: null,
      }),
    );
  });

  it('does not poll when the database is not initialized', async () => {
    (dataSource as { isInitialized?: boolean }).isInitialized = false;

    await publisher.publishPendingEvents();

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(rabbitmq.publishOutboxEvent).not.toHaveBeenCalled();
  });

  it('does not start a second poll while the previous batch is still processing', async () => {
    let releasePublish!: () => void;
    (rabbitmq.publishOutboxEvent as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releasePublish = resolve;
        }),
    );

    const firstPoll = publisher.publishPendingEvents();
    await Promise.resolve();
    await Promise.resolve();
    await publisher.publishPendingEvents();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    releasePublish();
    await firstPoll;
  });
});
