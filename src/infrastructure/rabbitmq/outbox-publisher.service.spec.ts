import { DataSource, Repository } from 'typeorm';
import { OutboxPublisher } from './outbox-publisher.service.js';
import { OutboxEvent, OutboxEventStatus } from './entities/outbox-event.entity.js';
import { RabbitMQService } from './rabbitmq.service.js';

describe('OutboxPublisher', () => {
  const event = {
    id: 'outbox-1',
    eventType: 'lead.created',
    exchange: 'crm.events',
    routingKey: 'lead.created',
    payload: { eventId: 'event-1', eventType: 'lead.created', data: { leadId: 'lead-1' } },
    attempts: 1,
    lockToken: 'lock-1',
  };

  let publisher: OutboxPublisher;
  let manager: { query: jest.Mock };
  let repository: jest.Mocked<Partial<Repository<OutboxEvent>>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let rabbitmq: jest.Mocked<Partial<RabbitMQService>>;

  beforeEach(() => {
    manager = { query: jest.fn().mockResolvedValue([{ ...event }]) };
    repository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataSource = {
      isInitialized: true,
      transaction: jest.fn().mockImplementation(
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
    );
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

  it('schedules an exponential retry when publication fails', async () => {
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
    expect(update.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(update.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it('moves an event to terminal failure after the retry limit', async () => {
    manager.query.mockResolvedValueOnce([{ ...event, attempts: 10 }]);
    rabbitmq.publishOutboxEvent!.mockRejectedValueOnce(
      new Error('permanent broker failure'),
    );

    await publisher.publishPendingEvents();

    expect(repository.update).toHaveBeenCalledWith(
      { id: event.id, lockToken: event.lockToken },
      expect.objectContaining({
        status: OutboxEventStatus.FAILED,
        lastError: 'permanent broker failure',
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
      () => new Promise<void>((resolve) => { releasePublish = resolve; }),
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
