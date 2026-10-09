import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SequencesService } from './sequences.service.js';
import {
  EnrollmentStatus,
  ExecutionStatus,
  FollowUpSequenceStatus,
} from './enums/follow-up.enum.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import type { DataSource, Repository } from 'typeorm';
import type { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import type { FollowUpStep } from './entities/follow-up-step.entity.js';
import type { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import type { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { User } from '../users/entities/user.entity.js';
import type { Interaction } from '../leads/entities/interaction.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';

describe('SequencesService', () => {
  let service: SequencesService;
  let sequencesRepo: jest.Mocked<Partial<Repository<FollowUpSequence>>>;
  let stepsRepo: jest.Mocked<Partial<Repository<FollowUpStep>>>;
  let enrollmentsRepo: jest.Mocked<Partial<Repository<LeadFollowUpEnrollment>>>;
  let executionsRepo: jest.Mocked<Partial<Repository<FollowUpExecution>>>;
  let leadsRepo: jest.Mocked<Partial<Repository<Lead>>>;
  let usersRepo: jest.Mocked<Partial<Repository<User>>>;
  let interactionsRepo: jest.Mocked<Partial<Repository<Interaction>>>;
  let rabbitmqService: jest.Mocked<Partial<RabbitMQService>>;

  const mockUser: User = {
    id: 'user-123',
    name: 'Sales Rep',
    email: 'rep@crm.local',
    passwordHash: 'hash',
    role: 'SALES' as any,
    status: 'ACTIVE' as any,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLead: Lead = {
    id: 'lead-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: null,
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    jobTitle: 'VP of Tech',
    companySize: 100,
    industry: 'Software',
    status: LeadStatus.QUALIFIED,
    sourceId: 'source-123',
    ownerId: 'user-123',
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStep1 = {
    id: 'step-1',
    sequenceId: 'seq-123',
    stepOrder: 1,
    delayMinutes: 0,
    channel: 'EMAIL',
    actionType: 'SEND_EMAIL',
    subjectTemplate: 'Welcome to Acme!',
    contentTemplate: 'Hi {{firstName}}, thanks for connecting.',
    conditions: null,
    metadata: null,
    isActive: true,
    actionConfig: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as FollowUpStep;

  const mockStep2 = {
    id: 'step-2',
    sequenceId: 'seq-123',
    stepOrder: 2,
    delayMinutes: 1440, // 1 day
    channel: 'EMAIL',
    actionType: 'SEND_EMAIL',
    subjectTemplate: 'Following up on our conversation',
    contentTemplate: 'Hi {{firstName}}, did you see my previous note?',
    conditions: null,
    metadata: null,
    isActive: true,
    actionConfig: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as FollowUpStep;

  const mockSequence = {
    id: 'seq-123',
    name: 'Inbound Demo Follow-Up Cadence',
    description: 'High-touch outreach for website demo requests',
    status: FollowUpSequenceStatus.ACTIVE,
    createdBy: 'user-123',
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [mockStep1, mockStep2],
    get isActive() {
      return this.status === FollowUpSequenceStatus.ACTIVE;
    },
  } as unknown as FollowUpSequence;

  const mockEnrollment: LeadFollowUpEnrollment = {
    id: 'enroll-123',
    leadId: 'lead-123',
    sequenceId: 'seq-123',
    currentStepId: 'step-1',
    status: EnrollmentStatus.ACTIVE,
    startedAt: new Date(),
    pausedAt: null,
    completedAt: null,
    cancelledAt: null,
    assignedBy: 'user-123',
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    sequencesRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    stepsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    enrollmentsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    executionsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    leadsRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    usersRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    rabbitmqService = {
      publishEvent: jest.fn().mockResolvedValue({
        eventId: 'evt-followup-1',
        eventType: 'lead.follow_up.triggered',
        version: 1,
        occurredAt: new Date().toISOString(),
        data: {},
      }),
    };

    interactionsRepo = {
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    service = new SequencesService(
      sequencesRepo as Repository<FollowUpSequence>,
      stepsRepo as Repository<FollowUpStep>,
      enrollmentsRepo as Repository<LeadFollowUpEnrollment>,
      executionsRepo as Repository<FollowUpExecution>,
      leadsRepo as Repository<Lead>,
      usersRepo as Repository<User>,
      rabbitmqService as RabbitMQService,
      interactionsRepo as Repository<Interaction>,
    );
  });

  // ── Sequence Management Tests ─────────────────────────────────────────────

  describe('createSequence', () => {
    it('should throw ConflictException if sequence name already exists', async () => {
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(mockSequence);

      await expect(
        service.createSequence({ name: 'Inbound Demo Follow-Up Cadence' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create sequence using fallback user when createdBy not passed', async () => {
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(null);
      (usersRepo.find as jest.Mock).mockResolvedValue([mockUser]);
      (sequencesRepo.create as jest.Mock).mockReturnValue(mockSequence);
      (sequencesRepo.save as jest.Mock).mockResolvedValue(mockSequence);

      const result = await service.createSequence({
        name: 'New Cadence',
        description: 'Testing cadence',
      });

      expect(result.id).toBe('seq-123');
      expect(sequencesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Cadence',
          createdBy: 'user-123',
          status: FollowUpSequenceStatus.ACTIVE,
        }),
      );
    });
  });

  describe('findSequenceById & findAllSequences', () => {
    it('should throw NotFoundException if sequence does not exist', async () => {
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findSequenceById('invalid-seq-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return sequence with sorted steps', async () => {
      const unsorted = {
        ...mockSequence,
        steps: [mockStep2, mockStep1],
      };
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(unsorted);

      const result = await service.findSequenceById('seq-123');

      expect(result.id).toBe('seq-123');
      expect(result.steps?.[0].stepOrder).toBe(1);
      expect(result.steps?.[1].stepOrder).toBe(2);
    });

    it('should return all sequences matching status', async () => {
      (sequencesRepo.find as jest.Mock).mockResolvedValue([mockSequence]);

      const result = await service.findAllSequences(
        FollowUpSequenceStatus.ACTIVE,
      );

      expect(result).toHaveLength(1);
      expect(sequencesRepo.find).toHaveBeenCalledWith({
        where: { status: FollowUpSequenceStatus.ACTIVE },
        order: { createdAt: 'DESC' },
        relations: { steps: true },
      });
    });
  });

  // ── Step Management Tests ─────────────────────────────────────────────────

  describe('createStep', () => {
    it('should throw ConflictException if stepOrder already exists in sequence', async () => {
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(mockSequence);
      (stepsRepo.findOne as jest.Mock).mockResolvedValue(mockStep1);

      await expect(
        service.createStep('seq-123', {
          stepOrder: 1,
          channel: 'EMAIL',
          actionType: 'SEND_EMAIL',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create step in sequence', async () => {
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(mockSequence);
      (stepsRepo.findOne as jest.Mock).mockResolvedValue(null);
      (stepsRepo.create as jest.Mock).mockReturnValue(mockStep1);
      (stepsRepo.save as jest.Mock).mockResolvedValue(mockStep1);

      const result = await service.createStep('seq-123', {
        stepOrder: 3,
        channel: 'EMAIL',
        actionType: 'SEND_EMAIL',
      });

      expect(result.id).toBe('step-1');
      expect(stepsRepo.save).toHaveBeenCalled();
    });
  });

  // ── Lead Follow-Up Enrollment (UC05) Tests ────────────────────────────────

  describe('enrollLead', () => {
    it('should throw NotFoundException if lead does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.enrollLead({
          leadId: 'invalid-lead',
          sequenceId: 'seq-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if sequence does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(mockLead);
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.enrollLead({
          leadId: 'lead-123',
          sequenceId: 'invalid-seq',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if sequence is not ACTIVE (e.g. DRAFT or PAUSED)', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(mockLead);
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockSequence,
        status: FollowUpSequenceStatus.PAUSED,
        isActive: false,
      });

      await expect(
        service.enrollLead({
          leadId: 'lead-123',
          sequenceId: 'seq-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if lead is already actively enrolled in this sequence', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(mockLead);
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(mockSequence);
      (enrollmentsRepo.findOne as jest.Mock).mockResolvedValue(mockEnrollment);

      await expect(
        service.enrollLead({
          leadId: 'lead-123',
          sequenceId: 'seq-123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if sequence has no steps', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(mockLead);
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockSequence,
        steps: [],
      });
      (enrollmentsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.enrollLead({
          leadId: 'lead-123',
          sequenceId: 'seq-123',
        }),
      ).rejects.toThrow(
        new BadRequestException('Cannot enroll into sequence with no steps'),
      );
    });

    it('should execute inside database transaction and record interaction log when dataSource is provided', async () => {
      const mockSavedEnrollment = { ...mockEnrollment };
      const mockSavedExec = { id: 'exec-tx-1' };
      const mockEnrollRepo = {
        create: jest.fn().mockReturnValue(mockSavedEnrollment),
        save: jest.fn().mockResolvedValue(mockSavedEnrollment),
      };
      const mockExecRepo = {
        create: jest.fn().mockReturnValue(mockSavedExec),
        save: jest.fn().mockResolvedValue(mockSavedExec),
      };
      const mockInterRepo = {
        create: jest.fn().mockReturnValue({ id: 'inter-1' }),
        save: jest.fn().mockResolvedValue({ id: 'inter-1' }),
      };

      const mockDataSource = {
        transaction: jest
          .fn()
          .mockImplementation(
            (
              cb: (manager: {
                getRepository: (entity: unknown) => unknown;
              }) => Promise<unknown>,
            ) => {
              return cb({
                getRepository: jest.fn().mockImplementation((entity) => {
                  if (
                    entity &&
                    (entity as { name?: string }).name ===
                      'LeadFollowUpEnrollment'
                  ) {
                    return mockEnrollRepo;
                  }
                  if (
                    entity &&
                    (entity as { name?: string }).name === 'FollowUpExecution'
                  ) {
                    return mockExecRepo;
                  }
                  return mockInterRepo;
                }),
              });
            },
          ),
      };

      const txService = new SequencesService(
        sequencesRepo as Repository<FollowUpSequence>,
        stepsRepo as Repository<FollowUpStep>,
        enrollmentsRepo as Repository<LeadFollowUpEnrollment>,
        executionsRepo as Repository<FollowUpExecution>,
        leadsRepo as Repository<Lead>,
        usersRepo as Repository<User>,
        rabbitmqService as RabbitMQService,
        interactionsRepo as Repository<Interaction>,
        mockDataSource as unknown as DataSource,
      );

      (leadsRepo.findOne as jest.Mock).mockResolvedValue(mockLead);
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(mockSequence);
      (enrollmentsRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await txService.enrollLead({
        leadId: 'lead-123',
        sequenceId: 'seq-123',
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockInterRepo.save).toHaveBeenCalled();
      expect(result.enrollment.status).toBe(EnrollmentStatus.ACTIVE);
      expect(result.firstStep.id).toBe('step-1');
    });

    it('should enroll lead with status ACTIVE, determine first step, schedule execution, and publish event', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(mockLead);
      (sequencesRepo.findOne as jest.Mock).mockResolvedValue(mockSequence);
      (enrollmentsRepo.findOne as jest.Mock).mockResolvedValue(null); // No existing active enrollment
      (enrollmentsRepo.create as jest.Mock).mockReturnValue(mockEnrollment);
      (enrollmentsRepo.save as jest.Mock).mockResolvedValue(mockEnrollment);
      (executionsRepo.create as jest.Mock).mockReturnValue({
        id: 'exec-1',
        enrollmentId: 'enroll-123',
        stepId: 'step-1',
        status: ExecutionStatus.PENDING,
      });
      (executionsRepo.save as jest.Mock).mockResolvedValue({
        id: 'exec-1',
        enrollmentId: 'enroll-123',
        stepId: 'step-1',
        status: ExecutionStatus.PENDING,
      });

      const result = await service.enrollLead({
        leadId: 'lead-123',
        sequenceId: 'seq-123',
        assignedBy: 'user-123',
      });

      // 1. Enrollment created with ACTIVE status and first step
      expect(result.enrollment.status).toBe(EnrollmentStatus.ACTIVE);
      expect(result.firstStep?.id).toBe('step-1');
      expect(enrollmentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-123',
          sequenceId: 'seq-123',
          currentStepId: 'step-1',
          status: EnrollmentStatus.ACTIVE,
        }),
      );

      // 2. Initial execution scheduled
      expect(executionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollmentId: 'enroll-123',
          stepId: 'step-1',
          status: ExecutionStatus.PENDING,
        }),
      );
      expect(executionsRepo.save).toHaveBeenCalled();

      // 3. RabbitMQ event published
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        'lead.follow_up.triggered',
        expect.objectContaining({
          enrollmentId: 'enroll-123',
          leadId: 'lead-123',
          sequenceId: 'seq-123',
          stepId: 'step-1',
        }),
      );
    });
  });

  describe('cancelEnrollment', () => {
    it('should throw BadRequestException if enrollment is already COMPLETED', async () => {
      (enrollmentsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockEnrollment,
        status: EnrollmentStatus.COMPLETED,
      });

      await expect(service.cancelEnrollment('enroll-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should cancel enrollment, set cancelledAt, and skip pending executions', async () => {
      const activeEnrollmentWithExecutions = {
        ...mockEnrollment,
        status: EnrollmentStatus.ACTIVE,
        executions: [
          {
            id: 'exec-1',
            status: ExecutionStatus.PENDING,
          },
        ],
      };
      (enrollmentsRepo.findOne as jest.Mock).mockResolvedValue(
        activeEnrollmentWithExecutions,
      );
      (enrollmentsRepo.save as jest.Mock).mockImplementation((e) =>
        Promise.resolve(e),
      );
      (executionsRepo.save as jest.Mock).mockImplementation((ex) =>
        Promise.resolve(ex),
      );

      const result = await service.cancelEnrollment('enroll-123', {
        cancellationReason: 'Lead requested no contact',
      });

      expect(result.status).toBe(EnrollmentStatus.CANCELLED);
      expect(result.cancellationReason).toBe('Lead requested no contact');
      expect(result.cancelledAt).toBeInstanceOf(Date);
      expect(activeEnrollmentWithExecutions.executions[0].status).toBe(
        ExecutionStatus.SKIPPED,
      );
    });
  });
});
