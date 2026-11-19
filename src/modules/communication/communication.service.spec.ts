import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import {
  EnrollmentStatus,
  ExecutionStatus,
} from '../follow-up/enums/follow-up.enum.js';
import {
  CommunicationDelivery,
  CommunicationDeliveryStatus,
} from './entities/communication-delivery.entity.js';
import {
  CommunicationService,
  type SmtpTransport,
  type SmtpTransportFactory,
} from './communication.service.js';

describe('CommunicationService', () => {
  const executionId = '11111111-1111-4111-8111-111111111111';
  const execution = {
    id: executionId,
    enrollmentId: '22222222-2222-4222-8222-222222222222',
    stepId: '33333333-3333-4333-8333-333333333333',
    status: ExecutionStatus.RUNNING,
    requestPayload: {
      channel: 'EMAIL',
      actionType: 'SEND_EMAIL',
      recipient: 'customer@example.com',
      subject: 'Hello customer',
      message: '<script>alert("x")</script>\nThanks',
    },
  } as unknown as FollowUpExecution;

  let service: CommunicationService;
  let delivery: CommunicationDelivery | null;
  let transport: jest.Mocked<SmtpTransport>;
  let transportFactory: jest.MockedFunction<SmtpTransportFactory>;
  let config: jest.Mocked<Partial<ConfigService>>;
  let deliveryRepository: jest.Mocked<
    Partial<Repository<CommunicationDelivery>>
  >;
  let executionRepository: jest.Mocked<
    Partial<Repository<FollowUpExecution>>
  >;
  let enrollmentRepository: jest.Mocked<
    Partial<Repository<LeadFollowUpEnrollment>>
  >;
  let enrollmentStatus: EnrollmentStatus;

  beforeEach(() => {
    delivery = null;
    enrollmentStatus = EnrollmentStatus.ACTIVE;
    execution.status = ExecutionStatus.RUNNING;
    execution.requestPayload = {
      channel: 'EMAIL',
      actionType: 'SEND_EMAIL',
      recipient: 'customer@example.com',
      subject: 'Hello customer',
      message: '<script>alert("x")</script>\nThanks',
    };
    transport = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-message-1' }),
      close: jest.fn(),
    };
    transportFactory = jest.fn().mockReturnValue(transport);
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          SMTP_SECURE: 'false',
          SMTP_FROM_EMAIL: 'noreply@example.com',
          SMTP_USER: 'smtp-user',
          SMTP_PASS: 'smtp-pass',
        };
        return values[key];
      }),
    };
    deliveryRepository = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(delivery)),
      find: jest.fn().mockImplementation(() =>
        Promise.resolve(delivery ? [delivery] : []),
      ),
      create: jest.fn((value: Partial<CommunicationDelivery>) => ({
        id: 'delivery-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...value,
      }) as CommunicationDelivery),
      save: jest.fn().mockImplementation((value: CommunicationDelivery) => {
        delivery = {
          ...value,
          updatedAt: new Date(),
        };
        return Promise.resolve(delivery);
      }),
    } as unknown as jest.Mocked<Partial<Repository<CommunicationDelivery>>>;
    executionRepository = {
      findOne: jest.fn().mockResolvedValue(execution),
    };
    enrollmentRepository = {
      findOne: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: execution.enrollmentId,
          status: enrollmentStatus,
        }),
      ),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === LeadFollowUpEnrollment) return enrollmentRepository;
        if (entity === FollowUpExecution) return executionRepository;
        if (entity === CommunicationDelivery) return deliveryRepository;
        throw new Error('Unexpected repository');
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager as unknown as EntityManager),
      ),
    };

    service = new CommunicationService(
      dataSource as unknown as DataSource,
      executionRepository as Repository<FollowUpExecution>,
      deliveryRepository as Repository<CommunicationDelivery>,
      config as ConfigService,
      transportFactory,
    );
  });

  it('sends only the persisted email content and persists the provider receipt', async () => {
    const result = await service.sendFollowUpExecution(executionId, executionId);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        providerMessageId: 'smtp-message-1',
        retryable: false,
        deliveryStatus: CommunicationDeliveryStatus.SENT,
        idempotencyStatus: 'new',
      }),
    );
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: 'customer@example.com',
        subject: 'Hello customer',
        text: '<script>alert("x")</script>\nThanks',
        html: expect.stringContaining('&lt;script&gt;'),
      }),
    );
    expect(delivery).toEqual(
      expect.objectContaining({
        executionId,
        idempotencyKey: `follow-up:${executionId}`,
        status: CommunicationDeliveryStatus.SENT,
        attempts: 1,
        providerMessageId: 'smtp-message-1',
      }),
    );
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('replays a successful delivery after the execution has transitioned to SUCCESS', async () => {
    await service.sendFollowUpExecution(executionId, executionId);
    execution.status = ExecutionStatus.SUCCESS;
    enrollmentStatus = EnrollmentStatus.CANCELLED;

    const replay = await service.sendFollowUpExecution(executionId, executionId);

    expect(replay.success).toBe(true);
    expect(replay.idempotencyStatus).toBe('replayed');
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects a changed payload for an already claimed execution', async () => {
    await service.sendFollowUpExecution(executionId, executionId);
    execution.requestPayload = {
      ...(execution.requestPayload ?? {}),
      message: 'A different message',
    };

    await expect(
      service.sendFollowUpExecution(executionId, executionId),
    ).rejects.toThrow(ConflictException);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not resend when an old PROCESSING claim has an ambiguous outcome', async () => {
    await service.sendFollowUpExecution(executionId, executionId);
    if (!delivery) throw new Error('Expected delivery to be persisted');
    delivery.status = CommunicationDeliveryStatus.PROCESSING;
    delivery.startedAt = new Date(Date.now() - 3 * 60_000);

    const result = await service.sendFollowUpExecution(executionId, executionId);

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.deliveryStatus).toBe(CommunicationDeliveryStatus.UNKNOWN);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('marks stale PROCESSING deliveries UNKNOWN without waiting for another request', async () => {
    await service.sendFollowUpExecution(executionId, executionId);
    if (!delivery) throw new Error('Expected delivery to be persisted');
    delivery.status = CommunicationDeliveryStatus.PROCESSING;
    delivery.startedAt = new Date(Date.now() - 3 * 60_000);

    await service.sweepStaleProcessingDeliveries();

    expect(delivery.status).toBe(CommunicationDeliveryStatus.UNKNOWN);
    expect(delivery.lastError).toBe('DELIVERY_OUTCOME_UNKNOWN');
    expect(deliveryRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: CommunicationDeliveryStatus.PROCESSING,
        }),
        take: 50,
      }),
    );
  });

  it('marks an SMTP connection timeout UNKNOWN and never retries it automatically', async () => {
    const timeout = Object.assign(new Error('socket timed out'), {
      code: 'ETIMEDOUT',
    });
    transport.sendMail.mockRejectedValueOnce(timeout);

    const first = await service.sendFollowUpExecution(executionId, executionId);
    const second = await service.sendFollowUpExecution(executionId, executionId);

    expect(first.deliveryStatus).toBe(CommunicationDeliveryStatus.UNKNOWN);
    expect(first.retryable).toBe(false);
    expect(second.deliveryStatus).toBe(CommunicationDeliveryStatus.UNKNOWN);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('retries a definite pre-connect failure with the same delivery identity', async () => {
    const refused = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
    });
    transport.sendMail
      .mockRejectedValueOnce(refused)
      .mockResolvedValueOnce({ messageId: 'smtp-message-2' });

    const first = await service.sendFollowUpExecution(executionId, executionId);
    const second = await service.sendFollowUpExecution(executionId, executionId);

    expect(first.deliveryStatus).toBe(
      CommunicationDeliveryStatus.RETRYABLE_FAILURE,
    );
    expect(first.retryable).toBe(true);
    expect(second.deliveryStatus).toBe(CommunicationDeliveryStatus.SENT);
    expect(delivery?.attempts).toBe(2);
    expect(delivery?.id).toBe('delivery-1');
    expect(transport.sendMail).toHaveBeenCalledTimes(2);
  });

  it('makes the fourth retryable SMTP failure terminal', async () => {
    const refused = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
    });
    transport.sendMail.mockRejectedValue(refused);

    let result = await service.sendFollowUpExecution(executionId, executionId);
    expect(result.deliveryStatus).toBe(
      CommunicationDeliveryStatus.RETRYABLE_FAILURE,
    );
    result = await service.sendFollowUpExecution(executionId, executionId);
    expect(result.deliveryStatus).toBe(
      CommunicationDeliveryStatus.RETRYABLE_FAILURE,
    );
    result = await service.sendFollowUpExecution(executionId, executionId);
    expect(result.deliveryStatus).toBe(
      CommunicationDeliveryStatus.RETRYABLE_FAILURE,
    );
    result = await service.sendFollowUpExecution(executionId, executionId);

    expect(result.deliveryStatus).toBe(
      CommunicationDeliveryStatus.PERMANENT_FAILURE,
    );
    expect(result.retryable).toBe(false);
    expect(delivery?.attempts).toBe(4);
    expect(transport.sendMail).toHaveBeenCalledTimes(4);
  });

  it('does not start a new delivery for a paused enrollment', async () => {
    enrollmentStatus = EnrollmentStatus.PAUSED;

    await expect(
      service.sendFollowUpExecution(executionId, executionId),
    ).rejects.toMatchObject({ status: 423 });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(delivery).toBeNull();
  });

  it('does not start a new delivery for a cancelled enrollment', async () => {
    enrollmentStatus = EnrollmentStatus.CANCELLED;

    await expect(
      service.sendFollowUpExecution(executionId, executionId),
    ).rejects.toThrow(ConflictException);
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(delivery).toBeNull();
  });

  it('rejects arbitrary idempotency keys before accessing persistence', async () => {
    await expect(
      service.sendFollowUpExecution(executionId, 'different-key'),
    ).rejects.toThrow(BadRequestException);
    expect(executionRepository.findOne).not.toHaveBeenCalled();
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('refuses non-email follow-up actions rather than silently sending them as email', async () => {
    execution.requestPayload = {
      channel: 'SMS',
      actionType: 'SEND_SMS',
      recipient: '+84901234567',
      subject: '',
      message: 'Hello',
    };

    await expect(
      service.sendFollowUpExecution(executionId, executionId),
    ).rejects.toThrow(BadRequestException);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});
