import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { FollowUpService } from './follow-up.service.js';
import { EnrollmentStatus, ExecutionStatus } from './enums/follow-up.enum.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { N8nClientService } from '../../infrastructure/n8n/n8n-client.service.js';
import type { N8nFollowUpResponse } from './interfaces/follow-up-execution.interface.js';

describe('FollowUpService lifecycle concurrency', () => {
  let service: FollowUpService;
  let enrollmentRepository: jest.Mocked<Partial<Repository<LeadFollowUpEnrollment>>>;
  let executionRepository: jest.Mocked<Partial<Repository<FollowUpExecution>>>;
  let stepRepository: jest.Mocked<Partial<Repository<FollowUpStep>>>;
  let auditRepository: jest.Mocked<Partial<Repository<AuditLog>>>;
  let manager: { getRepository: jest.Mock; query: jest.Mock };
  let dataSource: jest.Mocked<Partial<DataSource>>;

  const makeEnrollment = (
    overrides: Partial<LeadFollowUpEnrollment> = {},
  ): LeadFollowUpEnrollment =>
    ({
      id: 'enrollment-1',
      leadId: 'lead-1',
      sequenceId: 'sequence-1',
      currentStepId: 'step-1',
      status: EnrollmentStatus.ACTIVE,
      startedAt: new Date(),
      pausedAt: null,
      completedAt: null,
      cancelledAt: null,
      assignedBy: 'user-1',
      cancellationReason: null,
      ...overrides,
    }) as LeadFollowUpEnrollment;

  const makeExecution = (
    overrides: Partial<FollowUpExecution> = {},
  ): FollowUpExecution =>
    ({
      id: 'execution-1',
      enrollmentId: 'enrollment-1',
      stepId: 'step-1',
      status: ExecutionStatus.RUNNING,
      scheduledAt: new Date(Date.now() - 60_000),
      startedAt: new Date(),
      completedAt: null,
      providerMessageId: null,
      requestPayload: null,
      responsePayload: null,
      errorMessage: null,
      retryCount: 0,
      ...overrides,
    }) as FollowUpExecution;

  const makeStep = (
    overrides: Partial<FollowUpStep> = {},
  ): FollowUpStep =>
    ({
      id: 'step-2',
      sequenceId: 'sequence-1',
      stepOrder: 2,
      delayMinutes: 5,
      channel: 'EMAIL',
      actionType: 'SEND_EMAIL',
      subjectTemplate: 'Follow up',
      contentTemplate: 'Hello',
      conditions: null,
      metadata: null,
      actionConfig: null,
      isActive: true,
      ...overrides,
    }) as FollowUpStep;

  beforeEach(() => {
    enrollmentRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (entity) => entity),
    };
    executionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((entity) => ({ id: 'next-execution', ...entity })),
      save: jest.fn(async (entity) => entity),
    };
    stepRepository = {
      findOne: jest.fn(),
    };
    auditRepository = {
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
    };

    const repositories = new Map<unknown, unknown>([
      [LeadFollowUpEnrollment, enrollmentRepository],
      [FollowUpExecution, executionRepository],
      [FollowUpStep, stepRepository],
      [AuditLog, auditRepository],
    ]);
    manager = {
      getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
      query: jest.fn().mockResolvedValue([]),
    };
    dataSource = {
      transaction: jest.fn(async (callback) =>
        callback(manager as unknown as EntityManager),
      ),
    };

    service = new FollowUpService(
      enrollmentRepository as Repository<LeadFollowUpEnrollment>,
      {} as Repository<FollowUpSequence>,
      stepRepository as Repository<FollowUpStep>,
      executionRepository as Repository<FollowUpExecution>,
      {} as Repository<Lead>,
      {} as Repository<Customer>,
      auditRepository as Repository<AuditLog>,
      dataSource as DataSource,
      {} as N8nClientService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('revalidates pause against the locked current enrollment instead of saving a stale ACTIVE snapshot', async () => {
    enrollmentRepository.findOne
      ?.mockResolvedValueOnce(makeEnrollment())
      .mockResolvedValueOnce(
        makeEnrollment({ status: EnrollmentStatus.CANCELLED }),
      );

    await expect(
      service.pauseEnrollment('enrollment-1', {}),
    ).rejects.toThrow('cannot be paused');

    expect(enrollmentRepository.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'enrollment-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(enrollmentRepository.save).not.toHaveBeenCalled();
  });

  it('does not dispatch when the enrollment was paused before execution acquired its lock', async () => {
    const lead = {
      id: 'lead-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+84900000000',
      companyName: 'Analytical Engines',
      companyWebsite: null,
      jobTitle: null,
      companySize: null,
      industry: null,
      status: 'QUALIFIED',
      sourceId: 'source-1',
      ownerId: null,
      convertedCustomerId: null,
      convertedBy: null,
      convertedAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Lead;
    const existing = Object.assign(makeEnrollment(), { lead });
    enrollmentRepository.findOne
      ?.mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(
        makeEnrollment({ status: EnrollmentStatus.PAUSED }),
      );
    stepRepository.findOne?.mockResolvedValue(makeStep({ id: 'step-1' }));

    await expect(
      service.execute({ enrollmentId: 'enrollment-1' }),
    ).rejects.toThrow('cannot execute steps');

    expect(executionRepository.create).not.toHaveBeenCalled();
  });

  it('keeps a cancelled enrollment cancelled when an in-flight delivery completes', async () => {
    const execution = makeExecution();
    enrollmentRepository.findOne?.mockResolvedValue(
      makeEnrollment({ status: EnrollmentStatus.CANCELLED }),
    );

    const result = await (
      service as unknown as {
        handleSuccess: (
          execution: FollowUpExecution,
          enrollment: LeadFollowUpEnrollment,
          step: FollowUpStep,
          response: N8nFollowUpResponse,
        ) => Promise<{ execution: FollowUpExecution; hasNextStep: boolean }>;
      }
    ).handleSuccess(
      execution,
      makeEnrollment({ status: EnrollmentStatus.ACTIVE }),
      makeStep(),
      { success: true, providerMessageId: 'provider-1' },
    );

    expect(result.execution.status).toBe(ExecutionStatus.SUCCESS);
    expect(result.hasNextStep).toBe(false);
    expect(enrollmentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: EnrollmentStatus.CANCELLED }),
    );
    expect(executionRepository.create).not.toHaveBeenCalled();
    expect(stepRepository.findOne).not.toHaveBeenCalled();
  });

  it('keeps a paused enrollment paused while persisting the next step as pending', async () => {
    const execution = makeExecution();
    const pausedEnrollment = makeEnrollment({
      status: EnrollmentStatus.PAUSED,
    });
    enrollmentRepository.findOne?.mockResolvedValue(pausedEnrollment);
    stepRepository.findOne?.mockResolvedValue(makeStep());
    executionRepository.findOne?.mockResolvedValue(null);

    const result = await (
      service as unknown as {
        handleSuccess: (
          execution: FollowUpExecution,
          enrollment: LeadFollowUpEnrollment,
          step: FollowUpStep,
          response: N8nFollowUpResponse,
        ) => Promise<{ execution: FollowUpExecution; hasNextStep: boolean }>;
      }
    ).handleSuccess(
      execution,
      makeEnrollment({ status: EnrollmentStatus.ACTIVE }),
      makeStep({ id: 'step-1', stepOrder: 1 }),
      { success: true, providerMessageId: 'provider-1' },
    );

    expect(result.hasNextStep).toBe(true);
    expect(enrollmentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: EnrollmentStatus.PAUSED,
        currentStepId: 'step-2',
      }),
    );
    expect(executionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentId: 'enrollment-1',
        stepId: 'step-2',
        status: ExecutionStatus.PENDING,
      }),
    );
  });

  it('does not recover an execution another worker already completed', async () => {
    const staleCandidate = makeExecution({
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    executionRepository.find?.mockResolvedValue([staleCandidate]);
    enrollmentRepository.findOne?.mockResolvedValue(makeEnrollment());
    executionRepository.findOne?.mockResolvedValue(
      makeExecution({ status: ExecutionStatus.SUCCESS }),
    );

    await service.handleStaleRunningExecutions();

    expect(enrollmentRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'enrollment-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(executionRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'execution-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(executionRepository.save).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });
});
