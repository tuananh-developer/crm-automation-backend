import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { FollowUpService } from './follow-up.service.js';
import { EnrollmentStatus, ExecutionStatus } from './enums/follow-up.enum.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { N8nClientService } from '../../infrastructure/n8n/n8n-client.service.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';

describe('FollowUpService', () => {
  let service: FollowUpService;
  let enrollmentsRepository: jest.Mocked<
    Partial<Repository<LeadFollowUpEnrollment>>
  >;
  let stepsRepository: jest.Mocked<Partial<Repository<FollowUpStep>>>;
  let executionsRepository: jest.Mocked<Partial<Repository<FollowUpExecution>>>;
  let leadsRepository: jest.Mocked<Partial<Repository<Lead>>>;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let auditLogRepository: jest.Mocked<Partial<Repository<AuditLog>>>;
  let n8nClientService: jest.Mocked<Partial<N8nClientService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;

  const env: Record<string, number | string> = {
    FOLLOW_UP_MAX_RETRIES: 2,
    FOLLOW_UP_RETRY_DELAY_MINUTES: 10,
    N8N_FOLLOW_UP_WEBHOOK_PATH: 'follow-up-execute',
  };

  const buildLead = (overrides: Partial<Lead> = {}): Lead => ({
    id: 'lead-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+84901234567',
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    jobTitle: 'VP Sales',
    companySize: 50,
    industry: 'Technology',
    status: LeadStatus.QUALIFIED,
    sourceId: 'source-1',
    ownerId: null,
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: 'Met at expo',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const buildStep = (overrides: Partial<FollowUpStep> = {}): FollowUpStep => ({
    id: 'step-1',
    sequenceId: 'sequence-1',
    stepOrder: 1,
    delayMinutes: 0,
    channel: 'EMAIL',
    actionType: 'SEND_EMAIL',
    subjectTemplate: 'Trao đổi về {{companyName}}',
    contentTemplate:
      'Xin chào {{firstName}},\nchúng tôi muốn trao đổi thêm với bạn về nhu cầu của {{companyName}}.',
    conditions: null,
    metadata: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const buildEnrollment = (
    overrides: Partial<LeadFollowUpEnrollment> = {},
  ): LeadFollowUpEnrollment => ({
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const dto = { enrollmentId: 'enrollment-1' };

  beforeEach(() => {
    enrollmentsRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    stepsRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    executionsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    leadsRepository = {
      findOne: jest.fn(),
    };

    customersRepository = {
      findOne: jest.fn(),
    };

    auditLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    (executionsRepository.create as jest.Mock).mockImplementation(
      (data: Partial<FollowUpExecution>) =>
        ({ id: 'execution-1', ...data }) as FollowUpExecution,
    );
    (executionsRepository.save as jest.Mock).mockImplementation(
      (execution: FollowUpExecution) => Promise.resolve(execution),
    );
    (auditLogRepository.create as jest.Mock).mockImplementation(
      (data: Partial<AuditLog>) => data as AuditLog,
    );
    (auditLogRepository.save as jest.Mock).mockImplementation(
      (auditLog: AuditLog) => Promise.resolve(auditLog),
    );
    (enrollmentsRepository.save as jest.Mock).mockImplementation(
      (enrollment: LeadFollowUpEnrollment) => Promise.resolve(enrollment),
    );

    const transactionManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === FollowUpExecution) {
          return executionsRepository;
        }
        if (entity === LeadFollowUpEnrollment) {
          return enrollmentsRepository;
        }
        if (entity === FollowUpStep) {
          return stepsRepository;
        }
        if (entity === AuditLog) {
          return auditLogRepository;
        }
        return enrollmentsRepository;
      }),
      query: jest.fn().mockResolvedValue([]),
    };

    const transactionMock: jest.Mock = jest.fn(
      (runInTransaction: (manager: EntityManager) => Promise<unknown>) =>
        runInTransaction(transactionManager as unknown as EntityManager),
    );

    n8nClientService = {
      triggerWebhook: jest.fn().mockResolvedValue({
        success: true,
        providerMessageId: 'provider-msg-1',
        message: 'Follow-up executed successfully',
      }),
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in env ? env[key] : defaultValue,
      ),
    };

    service = new FollowUpService(
      enrollmentsRepository as Repository<LeadFollowUpEnrollment>,
      stepsRepository as Repository<FollowUpStep>,
      executionsRepository as Repository<FollowUpExecution>,
      leadsRepository as Repository<Lead>,
      customersRepository as Repository<Customer>,
      auditLogRepository as Repository<AuditLog>,
      { transaction: transactionMock } as unknown as DataSource,
      n8nClientService as N8nClientService,
      configService as ConfigService,
    );
  });

  describe('execute - success flow', () => {
    beforeEach(() => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({ lead: buildLead() }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(buildStep());
      (executionsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (enrollmentsRepository.save as jest.Mock).mockImplementation(
        (enrollment: LeadFollowUpEnrollment) => Promise.resolve(enrollment),
      );
    });

    it('should execute the follow-up successfully and return execution, status, retryCount and message', async () => {
      // No further step in the sequence
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.execute(dto);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.retryCount).toBe(0);
      expect(result.execution.providerMessageId).toBe('provider-msg-1');
      expect(result.execution.completedAt).toBeInstanceOf(Date);
      expect(result.message).toContain('executed successfully');
      expect(n8nClientService.triggerWebhook).toHaveBeenCalledWith(
        'follow-up-execute',
        expect.objectContaining({
          enrollmentId: 'enrollment-1',
          stepId: 'step-1',
          channel: 'EMAIL',
        }),
      );
    });

    it('should build the message from the step template with lead variables', async () => {
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.execute(dto);

      expect(n8nClientService.triggerWebhook).toHaveBeenCalledWith(
        'follow-up-execute',
        expect.objectContaining({
          executionId: 'execution-1',
          recipient: 'john.doe@example.com',
          subject: 'Trao đổi về Acme Corp',
          message:
            'Xin chào John,\nchúng tôi muốn trao đổi thêm với bạn về nhu cầu của Acme Corp.',
          attempt: 1,
        }),
      );
    });

    it('should persist the execution with request and response payloads', async () => {
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.execute(dto);

      expect(executionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollmentId: 'enrollment-1',
          stepId: 'step-1',
          status: ExecutionStatus.PENDING,
          retryCount: 0,
        }),
      );

      const saved = (executionsRepository.save as jest.Mock).mock.calls
        .map(([execution]) => execution)
        .filter(
          (execution: FollowUpExecution) => execution.id === 'execution-1',
        );

      expect(saved.length).toBeGreaterThan(0);
      expect(saved[saved.length - 1]).toEqual(
        expect.objectContaining({
          status: ExecutionStatus.SUCCESS,
          providerMessageId: 'provider-msg-1',
          responsePayload: expect.objectContaining({ success: true }),
        }),
      );
    });

    it('should write an audit log for the execution', async () => {
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.execute(dto);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FOLLOW_UP_EXECUTED',
          entityType: 'FollowUpExecution',
          entityId: 'execution-1',
          newValue: expect.objectContaining({
            status: ExecutionStatus.SUCCESS,
          }),
        }),
      );
    });
  });

  describe('execute - enrollment progression', () => {
    beforeEach(() => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({ lead: buildLead() }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(buildStep());
      (executionsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (enrollmentsRepository.save as jest.Mock).mockImplementation(
        (enrollment: LeadFollowUpEnrollment) => Promise.resolve(enrollment),
      );
    });

    it('should move the enrollment to the next step and schedule it', async () => {
      const nextStep = buildStep({
        id: 'step-2',
        stepOrder: 2,
        delayMinutes: 30,
      });
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(nextStep);
      // existing execution for the next step does not exist yet
      (executionsRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.execute(dto);

      expect(enrollmentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EnrollmentStatus.ACTIVE,
          currentStepId: 'step-2',
        }),
      );
      expect(executionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollmentId: 'enrollment-1',
          stepId: 'step-2',
          status: ExecutionStatus.PENDING,
          retryCount: 0,
          scheduledAt: expect.any(Date),
        }),
      );
    });

    it('should complete the enrollment when there is no next step', async () => {
      (stepsRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.execute(dto);

      expect(enrollmentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EnrollmentStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      );
      expect(executionsRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute - failure and retry', () => {
    beforeEach(() => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({ lead: buildLead() }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValue(buildStep());
      (executionsRepository.findOne as jest.Mock).mockResolvedValue(null);
    });

    it('should mark the execution FAILED then RETRYING and store the error when the provider fails', async () => {
      (n8nClientService.triggerWebhook as jest.Mock).mockResolvedValue({
        success: false,
        error: 'SMTP connection refused',
      });

      // Snapshot every persisted status: the same entity instance is mutated
      // through the FAILED -> RETRYING transition inside one transaction
      const persistedStatuses: ExecutionStatus[] = [];
      (executionsRepository.save as jest.Mock).mockImplementation(
        (execution: FollowUpExecution) => {
          persistedStatuses.push(execution.status);
          return Promise.resolve(execution);
        },
      );

      const result = await service.execute(dto);

      expect(result.status).toBe(ExecutionStatus.RETRYING);
      expect(result.execution.errorMessage).toBe('SMTP connection refused');
      expect(result.execution.responsePayload).toEqual({
        success: false,
        error: 'SMTP connection refused',
      });
      expect(result.message).toContain('Retry 1/2');

      expect(persistedStatuses).toContain(ExecutionStatus.RUNNING);
      expect(persistedStatuses).toContain(ExecutionStatus.FAILED);
      expect(persistedStatuses).toContain(ExecutionStatus.RETRYING);
      expect(result.execution.scheduledAt).toBeInstanceOf(Date);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FOLLOW_UP_FAILED',
          metadata: expect.objectContaining({
            errorMessage: 'SMTP connection refused',
            retryScheduled: true,
          }),
        }),
      );
    });

    it('should store the timeout error message when the n8n webhook times out', async () => {
      (n8nClientService.triggerWebhook as jest.Mock).mockRejectedValue(
        new Error("n8n webhook 'follow-up-execute' timed out after 15000ms"),
      );

      const result = await service.execute(dto);

      expect(result.status).toBe(ExecutionStatus.RETRYING);
      expect(result.execution.errorMessage).toContain('timed out');
    });

    it('should keep the retry count and reuse the same execution record when retrying', async () => {
      const existingExecution = {
        id: 'execution-1',
        enrollmentId: 'enrollment-1',
        stepId: 'step-1',
        status: ExecutionStatus.RETRYING,
        scheduledAt: new Date(),
        startedAt: null,
        completedAt: null,
        providerMessageId: null,
        requestPayload: null,
        responsePayload: null,
        errorMessage: 'SMTP connection refused',
        retryCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as FollowUpExecution;

      (executionsRepository.findOne as jest.Mock).mockResolvedValue(
        existingExecution,
      );

      const result = await service.execute(dto);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.retryCount).toBe(1);
      expect(result.execution.id).toBe('execution-1');

      // No duplicate execution/history row is created for the retry
      expect(executionsRepository.create).not.toHaveBeenCalled();
      expect(n8nClientService.triggerWebhook).toHaveBeenCalledWith(
        'follow-up-execute',
        expect.objectContaining({ attempt: 2 }),
      );
    });

    it('should stop retrying and keep FAILED when the retry limit is reached', async () => {
      const existingExecution = {
        id: 'execution-1',
        enrollmentId: 'enrollment-1',
        stepId: 'step-1',
        status: ExecutionStatus.RETRYING,
        retryCount: 2,
        errorMessage: 'SMTP connection refused',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as FollowUpExecution;

      (executionsRepository.findOne as jest.Mock).mockResolvedValue(
        existingExecution,
      );
      (n8nClientService.triggerWebhook as jest.Mock).mockResolvedValue({
        success: false,
        error: 'SMTP connection refused again',
      });

      const result = await service.execute(dto);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.retryCount).toBe(2);
      expect(result.message).toContain('Retry limit of 2 reached');
    });
  });

  describe('execute - validation', () => {
    it('should throw NotFoundException when the enrollment does not exist', async () => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.execute(dto)).rejects.toThrow(NotFoundException);
      expect(n8nClientService.triggerWebhook).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the enrollment is not active', async () => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({
          status: EnrollmentStatus.COMPLETED,
          lead: buildLead(),
        }),
      );

      await expect(service.execute(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when the requested step does not belong to the sequence', async () => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({ lead: buildLead() }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValue(
        buildStep({ id: 'step-9', sequenceId: 'sequence-other' }),
      );

      await expect(
        service.execute({ enrollmentId: 'enrollment-1', stepId: 'step-9' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the step preconditions are not met', async () => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({
          lead: buildLead({ status: LeadStatus.NEW }),
        }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValue(
        buildStep({
          conditions: {
            field: 'status',
            operator: 'equals',
            value: 'QUALIFIED',
          },
        }),
      );

      await expect(service.execute(dto)).rejects.toThrow(BadRequestException);
      expect(n8nClientService.triggerWebhook).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the channel needs a phone number that the lead does not have', async () => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({ lead: buildLead({ phone: null }) }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValue(
        buildStep({ channel: 'SMS' }),
      );

      await expect(service.execute(dto)).rejects.toThrow(BadRequestException);
    });

    it('should not create a duplicate execution when the step already succeeded', async () => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({ lead: buildLead() }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValue(buildStep());
      (executionsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'execution-1',
        status: ExecutionStatus.SUCCESS,
      });

      await expect(service.execute(dto)).rejects.toThrow(ConflictException);

      expect(executionsRepository.create).not.toHaveBeenCalled();
      expect(n8nClientService.triggerWebhook).not.toHaveBeenCalled();
    });

    it('should not create a duplicate execution while the step is already running', async () => {
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(
        buildEnrollment({ lead: buildLead() }),
      );
      (stepsRepository.findOne as jest.Mock).mockResolvedValue(buildStep());
      (executionsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'execution-1',
        status: ExecutionStatus.RUNNING,
      });

      await expect(service.execute(dto)).rejects.toThrow(ConflictException);

      expect(executionsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findExecutions', () => {
    it('should return the execution history of an enrollment', async () => {
      (executionsRepository.find as jest.Mock).mockResolvedValue([
        { id: 'execution-1' },
      ]);

      const result = await service.findExecutions({
        enrollmentId: 'enrollment-1',
      });

      expect(result).toEqual([{ id: 'execution-1' }]);
      expect(executionsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { enrollmentId: 'enrollment-1' },
        }),
      );
    });
  });
});
