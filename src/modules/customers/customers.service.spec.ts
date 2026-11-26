import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomersService } from './customers.service.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Customer360Status } from './dto/customer-360-callback.dto.js';
import type { DataSource, Repository } from 'typeorm';
import { Customer } from './entities/customer.entity.js';
import type { N8nWorkflowDispatchService } from '../t12-workflows/n8n-workflow-dispatch.service.js';
import type { CustomerSegment } from './entities/customer-segment.entity.js';
import type { Segment } from './entities/segment.entity.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import type { LeadQualification } from '../lead-intelligence/entities/lead-qualification.entity.js';
import type { LeadEnrichment } from '../lead-intelligence/entities/lead-enrichment.entity.js';
import type { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { ExecutionStatus } from '../follow-up/enums/follow-up.enum.js';
import type { CustomerFeedback } from '../feedback/entities/customer-feedback.entity.js';
import type { WorkflowExecutionClaimsService } from '../t12-workflows/workflow-execution-claims.service.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

describe('CustomersService', () => {
  let service: CustomersService;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let customerSegmentsRepository: jest.Mocked<
    Partial<Repository<CustomerSegment>>
  >;
  let segmentsRepository: jest.Mocked<Partial<Repository<Segment>>>;
  let churnAssessmentsRepository: jest.Mocked<
    Partial<Repository<CustomerChurnAssessment>>
  >;
  let customerTasksRepository: jest.Mocked<Partial<Repository<CustomerTask>>>;
  let leadsRepository: jest.Mocked<Partial<Repository<Lead>>>;
  let interactionsRepository: jest.Mocked<Partial<Repository<Interaction>>>;
  let qualificationsRepository: jest.Mocked<
    Partial<Repository<LeadQualification>>
  >;
  let enrichmentsRepository: jest.Mocked<Partial<Repository<LeadEnrichment>>>;
  let scoresRepository: jest.Mocked<Partial<Repository<LeadScore>>>;
  let workflowRunsRepository: jest.Mocked<Partial<Repository<WorkflowRun>>>;
  let enrollmentsRepository: jest.Mocked<
    Partial<Repository<LeadFollowUpEnrollment>>
  >;
  let executionsRepository: jest.Mocked<Partial<Repository<FollowUpExecution>>>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let dataSourceMock: any;
  let dispatcherMock: jest.Mocked<Pick<N8nWorkflowDispatchService, 'enqueue'>>;

  const mockAdminUser: AuthenticatedUser = {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@crm.local',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSalesUser: AuthenticatedUser = {
    id: 'sales-1',
    name: 'Sales Rep',
    email: 'sales@crm.local',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOtherUser: AuthenticatedUser = {
    id: 'sales-other',
    name: 'Other Sales Rep',
    email: 'other@crm.local',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomer: Customer = {
    id: 'customer-1',
    name: 'Nguyen Van Test',
    email: 'test.review@example.com',
    phone: '0901234567',
    companyName: 'Test Company',
    companyWebsite: null,
    jobTitle: 'Manager',
    companySize: null,
    industry: null,
    isStrategic: false,
    status: 'CONVERTED',
    createdBy: 'sales-1',
    updatedBy: null,
    notes: null,
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
    updatedAt: new Date('2026-10-03T00:00:00.000Z'),
  };

  const adminActor: AuthenticatedUser = mockAdminUser;
  const salesActor: AuthenticatedUser = mockSalesUser;

  const createQueryBuilder = () => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  });

  beforeEach(() => {
    customersRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      query: jest.fn(),
    };
    customerSegmentsRepository = {};
    segmentsRepository = {};
    churnAssessmentsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    customerTasksRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    leadsRepository = {};
    interactionsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    qualificationsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    enrichmentsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    scoresRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    workflowRunsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    enrollmentsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    executionsRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'N8N_API_KEY') return 'test-n8n-secret';
        if (key === 'N8N_WEBHOOK_BASE_URL')
          return 'http://test-n8n:5678/webhook';
        if (key === 'GEMINI_MODEL') return 'gemini-3.5-flash-lite';
        return undefined;
      }),
    };

    dataSourceMock = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          getRepository: jest.fn((entity: any) => {
            if (entity === WorkflowRun) {
              return workflowRunsRepository;
            }
            if (entity === Customer) {
              return customersRepository;
            }
            return {
              create: jest.fn((dto) => ({ ...dto, id: 'run-1' })),
              save: jest.fn((e) => Promise.resolve({ ...e, id: 'run-1' })),
            };
          }),
        };
        return cb(manager);
      }),
    };

    dispatcherMock = {
      enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    service = new CustomersService(
      customersRepository as Repository<Customer>,
      customerSegmentsRepository as Repository<CustomerSegment>,
      segmentsRepository as Repository<Segment>,
      churnAssessmentsRepository as Repository<CustomerChurnAssessment>,
      customerTasksRepository as Repository<CustomerTask>,
      workflowRunsRepository as Repository<WorkflowRun>,
      leadsRepository as Repository<Lead>,
      interactionsRepository as Repository<Interaction>,
      qualificationsRepository as Repository<LeadQualification>,
      enrichmentsRepository as Repository<LeadEnrichment>,
      scoresRepository as Repository<LeadScore>,
      enrollmentsRepository as Repository<LeadFollowUpEnrollment>,
      executionsRepository as Repository<FollowUpExecution>,
      configService as ConfigService,
      dataSourceMock as DataSource,
      dispatcherMock,
    );
  });

  describe('findAll', () => {
    it('paginates customers newest first', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockCustomer], 1]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 20 }, adminActor);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('applies the search filter to name, email and company', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({ search: 'acme' }, adminActor);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('search'),
        { search: '%acme%' },
      );
    });

    it('applies the status filter', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({ status: 'CONVERTED' }, adminActor);

      expect(qb.andWhere).toHaveBeenCalledWith('customer.status = :status', {
        status: 'CONVERTED',
      });
    });

    it('scopes Sales customer lists to customers they created', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({}, salesActor);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'customer.createdBy = :actorId',
        {
          actorId: salesActor.id,
        },
      );
    });

    it('applies the isStrategic=true filter', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockCustomer], 1]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({ isStrategic: true }, adminActor);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'customer.isStrategic = :isStrategic',
        { isStrategic: true },
      );
    });

    it('applies the isStrategic=false filter', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockCustomer], 1]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({ isStrategic: false }, adminActor);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'customer.isStrategic = :isStrategic',
        { isStrategic: false },
      );
    });

    it('does not filter by isStrategic when undefined', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockCustomer], 1]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({ status: 'CONVERTED' }, adminActor);

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'customer.isStrategic = :isStrategic',
        expect.anything(),
      );
    });

    it('combines isStrategic with search, status, and pagination', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockCustomer], 1]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll(
        {
          page: 2,
          limit: 10,
          search: 'acme',
          status: 'CONVERTED',
          isStrategic: true,
        },
        adminActor,
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('search'),
        { search: '%acme%' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('customer.status = :status', {
        status: 'CONVERTED',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'customer.isStrategic = :isStrategic',
        { isStrategic: true },
      );
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
    });
  });

  describe('findOne', () => {
    it('returns a customer with its converted lead and segments', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [{ id: 'lead-1' }],
        customerSegments: [
          { segmentId: 'segment-1', segment: { id: 'segment-1', name: 'VIP' } },
          { segmentId: 'segment-2', segment: { id: 'segment-2', name: 'SMB' } },
        ],
      });

      const result = await service.findOne('customer-1', adminActor);

      expect(result.convertedLeads).toHaveLength(1);
      expect(result.customerSegments).toHaveLength(2);
      expect(result.segmentCount).toBe(2);
    });

    it('rejects an unknown customer id', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findOne('missing', adminActor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hides customers created by other users from Sales users', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'other-user',
      });

      await expect(
        service.findOne('customer-1', salesActor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getCustomer360 (T12-WF05)', () => {
    it('allows ADMIN users to read Customer 360 regardless of creator', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'other-user',
        convertedLeads: [],
        customerSegments: [],
      });

      const result = await service.getCustomer360('customer-1', mockAdminUser);

      expect(result).toBeDefined();
      expect(result.customer.id).toBe('customer-1');
      expect(result.sourceCoverage.crmProfile).toBe('AVAILABLE');
      expect(result.sourceCoverage.interactions).toBe('EMPTY');
    });

    it('allows creator SALES user to read Customer 360', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'sales-1',
        convertedLeads: [],
        customerSegments: [],
      });

      const result = await service.getCustomer360('customer-1', mockSalesUser);

      expect(result).toBeDefined();
      expect(result.customer.id).toBe('customer-1');
    });

    it('throws ForbiddenException when another SALES user attempts to read Customer 360', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'sales-1',
        convertedLeads: [],
        customerSegments: [],
      });

      await expect(
        service.getCustomer360('customer-1', mockOtherUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when customer does not exist', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getCustomer360('unknown-id', mockAdminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('dynamically marks sourceCoverage as AVAILABLE when datasets are populated', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [{ id: 'lead-1' }],
        customerSegments: [{ segmentId: 'seg-1' }],
      });
      (interactionsRepository.find as jest.Mock).mockResolvedValue([
        { id: 'int-1', leadId: 'lead-1' },
      ]);
      (scoresRepository.find as jest.Mock).mockResolvedValue([
        { id: 'sc-1', score: 85 },
      ]);

      const result = await service.getCustomer360('customer-1', mockAdminUser);

      expect(result.sourceCoverage.crmProfile).toBe('AVAILABLE');
      expect(result.sourceCoverage.interactions).toBe('AVAILABLE');
      expect(result.sourceCoverage.leadIntelligence).toBe('AVAILABLE');
      expect(result.sourceCoverage.segments).toBe('AVAILABLE');
      expect(result.sourceCoverage.followUps).toBe('EMPTY');
      expect(result.sourceCoverage.customerIssues).toBe('NOT_CONNECTED');
    });

    it('gates aiSummary strictly on successful WorkflowRun and leaves it null when run failed', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'sales-1',
        convertedLeads: [],
        customerSegments: [],
      });

      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-failed-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.FAILED,
        errorMessage: 'Gemini rate limit exceeded',
        outputPayload: {
          summary: 'Should not be exposed',
        },
        startedAt: new Date('2026-10-28T10:00:00Z'),
        finishedAt: new Date('2026-10-28T10:00:05Z'),
      });

      const result = await service.getCustomer360('customer-1', mockSalesUser);

      expect(result.aiSummary).toBeNull();
      expect(result.latestWorkflowRun).toEqual({
        id: 'run-failed-1',
        status: WorkflowStatus.FAILED,
        startedAt: expect.any(Date),
        completedAt: expect.any(Date),
        errorMessage: 'Gemini rate limit exceeded',
      });
    });

    it('synthesizes aiSummary when latest WorkflowRun has SUCCESS status with valid summary', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'sales-1',
        convertedLeads: [],
        customerSegments: [],
      });

      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-success-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.SUCCESS,
        outputPayload: {
          summary:
            'Solid enterprise relationship with high retention probability.',
          keyStrengths: ['High NPS', 'Active champion'],
          potentialRisks: ['No support tickets integrated'],
          growthOpportunities: ['Enterprise tier upgrade'],
          recommendedNextAction: 'Schedule annual executive business review.',
          modelInfo: { model: 'gemini-3.5-flash-lite' },
          evaluatedAt: '2026-10-28T10:00:05.000Z',
        },
        startedAt: new Date('2026-10-28T10:00:00Z'),
        finishedAt: new Date('2026-10-28T10:00:05Z'),
      });

      const result = await service.getCustomer360('customer-1', mockSalesUser);

      expect(result.aiSummary).not.toBeNull();
      expect(result.aiSummary?.summary).toBe(
        'Solid enterprise relationship with high retention probability.',
      );
      expect(result.aiSummary?.keyStrengths).toEqual([
        'High NPS',
        'Active champion',
      ]);
      expect(result.latestWorkflowRun?.status).toBe(WorkflowStatus.SUCCESS);
      expect(result.latestWorkflowRun?.errorMessage).toBeNull();
    });
  });

  describe('triggerCustomer360', () => {
    it('atomically commits WorkflowRun and enqueues OutboxEvent in the same transaction without direct HTTP fetch', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun = { id: 'run-1', customerId: 'customer-1' };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (workflowRunsRepository.create as jest.Mock).mockReturnValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const fetchSpy = jest.spyOn(global, 'fetch');

      const result = await service.triggerCustomer360(
        'customer-1',
        mockSalesUser,
        'req-key-1',
      );

      expect(result.workflowRunId).toBe('run-1');
      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      expect(workflowRunsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 't12-wf05-customer-360',
          customerId: 'customer-1',
          triggeredByUserId: mockSalesUser.id,
          idempotencyKey: 'wf05:sales-1:customer-1:req-key-1',
          status: WorkflowStatus.PENDING,
        }),
      );
      expect(dispatcherMock.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'N8N_WF05_WEBHOOK_URL',
        't12-wf05-customer-360',
        expect.objectContaining({
          customerId: 'customer-1',
          workflowRunId: 'run-1',
          triggeredByUserId: mockSalesUser.id,
          timestamp: expect.any(String),
        }),
      );
      // Ensures direct HTTP fetch is NOT called during service request lifecycle
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('fault injection: rolls back transaction and throws when outbox enqueue fails, preventing orphaned WorkflowRun', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (workflowRunsRepository.create as jest.Mock).mockReturnValue({
        id: 'run-1',
        customerId: 'customer-1',
      });
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue({
        id: 'run-1',
        customerId: 'customer-1',
      });
      dispatcherMock.enqueue.mockRejectedValueOnce(
        new Error('Outbox broker table locked / write failed'),
      );

      await expect(
        service.triggerCustomer360(
          'customer-1',
          mockSalesUser,
          'req-key-fault',
        ),
      ).rejects.toThrow('Outbox broker table locked / write failed');

      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws InternalServerErrorException when N8N_API_KEY is missing (Fail-Closed)', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await expect(
        service.triggerCustomer360('customer-1', mockSalesUser, 'req-key-auth'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('throws ForbiddenException when unauthorized SALES user attempts to trigger', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'sales-1',
        convertedLeads: [],
      });

      await expect(
        service.triggerCustomer360('customer-1', mockOtherUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns existing WorkflowRun and does not re-dispatch outbox event when called with same idempotency key', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const existingRun = {
        id: 'run-existing-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        idempotencyKey: 'wf05:sales-1:customer-1:client-key-1',
        status: WorkflowStatus.PENDING,
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        existingRun,
      );

      const result = await service.triggerCustomer360(
        'customer-1',
        mockSalesUser,
        'client-key-1',
      );

      expect(result.workflowRunId).toBe('run-existing-1');
      expect(workflowRunsRepository.create).not.toHaveBeenCalled();
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
      expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    });

    it('recovers from concurrent race condition (unique violation 23505) and returns existing WorkflowRun', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const concurrentRun = {
        id: 'run-concurrent-2',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        idempotencyKey: 'wf05:sales-1:customer-1:race-key',
        status: WorkflowStatus.PENDING,
      };

      // First findOne returns null (race condition begins)
      // Second findOne after 23505 conflict returns concurrentRun
      (workflowRunsRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(concurrentRun);

      (workflowRunsRepository.create as jest.Mock).mockReturnValue({
        id: 'run-attempted',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        idempotencyKey: 'wf05:sales-1:customer-1:race-key',
      });

      const uniqueViolationError = new Error(
        'duplicate key value violates unique constraint',
      );
      (uniqueViolationError as any).code = '23505';
      (workflowRunsRepository.save as jest.Mock).mockRejectedValueOnce(
        uniqueViolationError,
      );

      const result = await service.triggerCustomer360(
        'customer-1',
        mockSalesUser,
        'race-key',
      );

      expect(result.workflowRunId).toBe('run-concurrent-2');
      // Dispatcher should NOT have enqueued since the saving failed and concurrent record was reused
      expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    });

    it('throws ConflictException when idempotency key is already used for a different workflow', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const conflictingRun = {
        id: 'run-other-workflow',
        customerId: 'customer-1',
        workflowName: 't12-wf10-next-best-action',
        idempotencyKey: 'wf05:sales-1:customer-1:conflicting-key',
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        conflictingRun,
      );

      await expect(
        service.triggerCustomer360(
          'customer-1',
          mockSalesUser,
          'conflicting-key',
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when Idempotency-Key header is omitted', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      await expect(
        service.triggerCustomer360('customer-1', mockSalesUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when Idempotency-Key header is blank', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      await expect(
        service.triggerCustomer360('customer-1', mockSalesUser, '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when Idempotency-Key exceeds 120 characters', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      await expect(
        service.triggerCustomer360(
          'customer-1',
          mockSalesUser,
          'k'.repeat(121),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('handleCustomer360Callback', () => {
    it('successfully processes callback and marks WorkflowRun as SUCCESS when claimed with live lease', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun: any = {
        id: 'run-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: new Date(Date.now() + 60_000),
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-1',
        status: Customer360Status.SUCCESS,
        summary: 'Excellent enterprise profile',
        n8nExecutionId: 'exec-123',
      });

      expect(result.success).toBe(true);
      expect(result.customerId).toBe('customer-1');
      expect(mockRun.status).toBe(WorkflowStatus.SUCCESS);
      expect(mockRun.claimExpiresAt).toBeNull();
      expect(mockRun.outputPayload.summary).toBe(
        'Excellent enterprise profile',
      );
    });

    it('rejects callback when WorkflowRun has not been claimed (null n8nExecutionId)', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun: any = {
        id: 'run-unclaimed-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.PENDING,
        n8nExecutionId: null,
        claimExpiresAt: null,
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-unclaimed-1',
          status: Customer360Status.SUCCESS,
          summary: 'Bypassed claim',
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });

    it('rejects callback when dto.n8nExecutionId is missing or whitespace on a claimed WorkflowRun', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun: any = {
        id: 'run-claimed-missing-exec',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: new Date(Date.now() + 60_000),
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-claimed-missing-exec',
          status: Customer360Status.SUCCESS,
          summary: 'Missing execution ID',
          n8nExecutionId: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });

    it('enforces n8nExecutionId fencing and clears claimExpiresAt on valid active lease callback', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun: any = {
        id: 'run-claimed-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: new Date(Date.now() + 60_000),
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-claimed-1',
          status: Customer360Status.SUCCESS,
          summary: 'Stale execution',
          n8nExecutionId: 'exec-other',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-claimed-1',
        status: Customer360Status.SUCCESS,
        summary: 'Valid owner synthesis',
        n8nExecutionId: 'exec-123',
      });

      expect(result.success).toBe(true);
      expect(mockRun.status).toBe(WorkflowStatus.SUCCESS);
      expect(mockRun.claimExpiresAt).toBeNull();
    });

    it('rejects callback when WorkflowRun claim lease has expired or is missing', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-expired-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: new Date(Date.now() - 10_000),
      });

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-expired-1',
          status: Customer360Status.SUCCESS,
          summary: 'Expired lease synthesis',
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-missing-lease-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: null,
      });

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-missing-lease-1',
          status: Customer360Status.SUCCESS,
          summary: 'Missing lease expiry synthesis',
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects unknown workflowRunId without creating arbitrary runs', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'unknown-run',
          status: Customer360Status.SUCCESS,
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects correlation mismatch when workflowRun belongs to another customer', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        customerId: 'other-customer-id',
        workflowName: 't12-wf05-customer-360',
      });

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-1',
          status: Customer360Status.SUCCESS,
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects correlation mismatch when workflowName is not t12-wf05-customer-360', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        customerId: 'customer-1',
        workflowName: 'uc03-lead-enrichment',
      });

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-1',
          status: Customer360Status.SUCCESS,
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports failure accurately when workflow status is FAILED', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun: any = {
        id: 'run-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: new Date(Date.now() + 60_000),
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-1',
        status: Customer360Status.FAILED,
        errorMessage: 'Gemini AI rate limit exceeded',
        n8nExecutionId: 'exec-123',
      });

      expect(result.success).toBe(false);
      expect(mockRun.status).toBe(WorkflowStatus.FAILED);
      expect(mockRun.errorMessage).toBe('Gemini AI rate limit exceeded');
    });

    it('processes callback transition from RUNNING status to SUCCESS', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun: any = {
        id: 'run-running',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: new Date(Date.now() + 60_000),
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-running',
        status: Customer360Status.SUCCESS,
        summary: 'Running to success profile',
        n8nExecutionId: 'exec-123',
      });

      expect(result.success).toBe(true);
      expect(mockRun.status).toBe(WorkflowStatus.SUCCESS);
      expect(mockRun.outputPayload.summary).toBe('Running to success profile');
    });

    it('locks row with pessimistic_write and queries within transaction when dataSource is provided', async () => {
      const mockRun: any = {
        id: 'run-locked',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.RUNNING,
        n8nExecutionId: 'exec-123',
        claimExpiresAt: new Date(Date.now() + 60_000),
      };
      const mockRunsRepo = {
        findOne: jest.fn().mockResolvedValue(mockRun),
        save: jest.fn().mockResolvedValue(mockRun),
      };
      const mockCustRepo = {
        findOne: jest.fn().mockResolvedValue(mockCustomer),
      };
      const mockDataSource = {
        transaction: jest
          .fn()
          .mockImplementation(async (cb: (manager: any) => Promise<any>) => {
            return cb({
              getRepository: (entity: any) => {
                if (entity === Customer) return mockCustRepo;
                return mockRunsRepo;
              },
            });
          }),
      };

      const txService = new CustomersService(
        customersRepository as Repository<Customer>,
        customerSegmentsRepository as Repository<CustomerSegment>,
        segmentsRepository as Repository<Segment>,
        churnAssessmentsRepository as Repository<CustomerChurnAssessment>,
        customerTasksRepository as Repository<CustomerTask>,
        workflowRunsRepository as Repository<WorkflowRun>,
        leadsRepository as Repository<Lead>,
        interactionsRepository as Repository<Interaction>,
        qualificationsRepository as Repository<LeadQualification>,
        enrichmentsRepository as Repository<LeadEnrichment>,
        scoresRepository as Repository<LeadScore>,
        enrollmentsRepository as Repository<LeadFollowUpEnrollment>,
        executionsRepository as Repository<FollowUpExecution>,
        configService as ConfigService,
        mockDataSource as unknown as DataSource,
      );

      const result = await txService.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-locked',
        status: Customer360Status.SUCCESS,
        summary: 'Transaction locked summary',
        n8nExecutionId: 'exec-123',
      });

      expect(result.success).toBe(true);
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockRunsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'run-locked' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockRunsRepo.save).toHaveBeenCalled();
    });

    it('returns idempotent response for duplicate SUCCESS callback with matching execution ID and payload', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockCompletedRun: any = {
        id: 'run-success',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.SUCCESS,
        n8nExecutionId: 'exec-123',
        outputPayload: {
          summary: 'Original executive summary',
        },
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        mockCompletedRun,
      );

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-success',
        status: Customer360Status.SUCCESS,
        summary: 'Original executive summary',
        n8nExecutionId: 'exec-123',
      });

      expect(result.success).toBe(true);
      expect(result.workflowRunId).toBe('run-success');
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-success',
          status: Customer360Status.SUCCESS,
          summary: 'Original executive summary',
          n8nExecutionId: 'exec-other',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when duplicate SUCCESS callback arrives with conflicting summary payload', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockCompletedRun: any = {
        id: 'run-success-conflict',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.SUCCESS,
        n8nExecutionId: 'exec-123',
        outputPayload: {
          summary: 'Original executive summary',
        },
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        mockCompletedRun,
      );

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-success-conflict',
          status: Customer360Status.SUCCESS,
          summary: 'Conflicting new executive summary',
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });

    it('returns idempotent response for duplicate FAILED callback with matching error message', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockFailedRun: any = {
        id: 'run-failed-dup',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.FAILED,
        n8nExecutionId: 'exec-123',
        errorMessage: 'Initial provider failure',
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        mockFailedRun,
      );

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-failed-dup',
        status: Customer360Status.FAILED,
        errorMessage: 'Initial provider failure',
        n8nExecutionId: 'exec-123',
      });

      expect(result.success).toBe(false);
      expect(result.workflowRunId).toBe('run-failed-dup');
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when duplicate FAILED callback arrives with conflicting error message', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockFailedRun: any = {
        id: 'run-failed-err-conflict',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.FAILED,
        n8nExecutionId: 'exec-123',
        errorMessage: 'Initial provider failure',
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        mockFailedRun,
      );

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-failed-err-conflict',
          status: Customer360Status.FAILED,
          errorMessage: 'Completely different error reason',
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException (409) when late FAILED callback arrives for an already SUCCESS run', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockCompletedRun: any = {
        id: 'run-already-success',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.SUCCESS,
        n8nExecutionId: 'exec-123',
        outputPayload: {
          summary: 'Original executive summary',
        },
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        mockCompletedRun,
      );

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-already-success',
          status: Customer360Status.FAILED,
          errorMessage: 'Late timeout or error',
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockCompletedRun.status).toBe(WorkflowStatus.SUCCESS);
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException (409) when late SUCCESS callback arrives for an already FAILED run', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockFailedRun: any = {
        id: 'run-already-failed',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.FAILED,
        n8nExecutionId: 'exec-123',
        errorMessage: 'Timeout error',
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(
        mockFailedRun,
      );

      await expect(
        service.handleCustomer360Callback({
          customerId: 'customer-1',
          workflowRunId: 'run-already-failed',
          status: Customer360Status.SUCCESS,
          summary: 'Late success summary',
          n8nExecutionId: 'exec-123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockFailedRun.status).toBe(WorkflowStatus.FAILED);
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('claimAndGetCustomerProfile & lease renewal', () => {
    let executionClaimsMock: jest.Mocked<
      Pick<WorkflowExecutionClaimsService, 'claim' | 'heartbeat'>
    >;
    let feedbackRepoMock: jest.Mocked<Partial<Repository<CustomerFeedback>>>;
    let serviceWithClaims: CustomersService;

    beforeEach(() => {
      executionClaimsMock = {
        claim: jest.fn(),
        heartbeat: jest.fn(),
      };
      feedbackRepoMock = {
        count: jest.fn().mockResolvedValue(0),
      };
      serviceWithClaims = new CustomersService(
        customersRepository as Repository<Customer>,
        customerSegmentsRepository as Repository<CustomerSegment>,
        segmentsRepository as Repository<Segment>,
        churnAssessmentsRepository as Repository<CustomerChurnAssessment>,
        customerTasksRepository as Repository<CustomerTask>,
        workflowRunsRepository as Repository<WorkflowRun>,
        leadsRepository as Repository<Lead>,
        interactionsRepository as Repository<Interaction>,
        qualificationsRepository as Repository<LeadQualification>,
        enrichmentsRepository as Repository<LeadEnrichment>,
        scoresRepository as Repository<LeadScore>,
        enrollmentsRepository as Repository<LeadFollowUpEnrollment>,
        executionsRepository as Repository<FollowUpExecution>,
        configService as ConfigService,
        dataSourceMock as DataSource,
        dispatcherMock,
        executionClaimsMock as unknown as WorkflowExecutionClaimsService,
        feedbackRepoMock as Repository<CustomerFeedback>,
      );
    });

    it('claims the WF05 WorkflowRun and returns the customer profile', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [],
        customerSegments: [],
      });
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
      });
      executionClaimsMock.claim.mockResolvedValue({
        claimed: true,
        duplicate: false,
        recovered: false,
        status: WorkflowStatus.RUNNING,
        leaseExpiresAt: new Date().toISOString(),
      });

      const result = await serviceWithClaims.claimAndGetCustomerProfile(
        'customer-1',
        { workflowRunId: 'run-1', n8nExecutionId: 'exec-1' },
      );

      expect(result.id).toBe('customer-1');
      expect(executionClaimsMock.claim).toHaveBeenCalledWith({
        workflowRunId: 'run-1',
        workflowName: 't12-wf05-customer-360',
        n8nExecutionId: 'exec-1',
      });
    });

    it('throws ConflictException when another execution already owns the WorkflowRun', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
      });
      executionClaimsMock.claim.mockResolvedValue({
        claimed: false,
        duplicate: false,
        reason: 'ALREADY_CLAIMED',
        status: WorkflowStatus.RUNNING,
        leaseExpiresAt: new Date().toISOString(),
      });

      await expect(
        serviceWithClaims.claimAndGetCustomerProfile('customer-1', {
          workflowRunId: 'run-1',
          n8nExecutionId: 'exec-duplicate',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('renews execution lease in getCustomerSegments for internal service calls', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        customerSegments: [{ segmentId: 'seg-1', segment: { name: 'VIP' } }],
      });
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
      });
      executionClaimsMock.heartbeat.mockResolvedValue({
        renewed: true,
        workflowRunId: 'run-1',
        leaseExpiresAt: new Date().toISOString(),
      });

      const segments = await serviceWithClaims.getCustomerSegments(
        'customer-1',
        undefined,
        'run-1',
        'exec-1',
      );

      expect(segments).toHaveLength(1);
      expect(executionClaimsMock.heartbeat).toHaveBeenCalledWith({
        workflowRunId: 'run-1',
        workflowName: 't12-wf05-customer-360',
        n8nExecutionId: 'exec-1',
      });
    });

    it('reports truthful customerFeedback sourceCoverage when CustomerFeedback repository is available', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [],
        customerSegments: [],
      });
      (feedbackRepoMock.count as jest.Mock).mockResolvedValueOnce(2);

      const withFeedback = await serviceWithClaims.getCustomer360(
        'customer-1',
        mockAdminUser,
      );
      expect(withFeedback.sourceCoverage.customerFeedback).toBe('AVAILABLE');

      (feedbackRepoMock.count as jest.Mock).mockResolvedValueOnce(0);
      const withoutFeedback = await serviceWithClaims.getCustomer360(
        'customer-1',
        mockAdminUser,
      );
      expect(withoutFeedback.sourceCoverage.customerFeedback).toBe('EMPTY');
    });
  });

  describe('churn assessments', () => {
    it('returns a bounded cohort with pagination metadata', async () => {
      (customersRepository.findAndCount as jest.Mock).mockResolvedValue([
        [mockCustomer],
        250,
      ]);

      const result = await service.findChurnCustomerCohort(2, 500);

      expect(customersRepository.findAndCount).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          companyName: true,
          status: true,
        },
        order: { updatedAt: 'DESC' },
        take: 100,
        skip: 100,
      });
      expect(result.meta).toEqual({
        page: 2,
        limit: 100,
        total: 250,
        totalPages: 3,
      });
    });

    it('builds churn context only from persisted interactions and follow-up executions', async () => {
      const occurredAt = new Date('2026-11-08T10:00:00.000Z');
      const interaction = Object.assign(new Interaction(), {
        id: 'interaction-1',
        occurredAt,
      });
      const execution = Object.assign(new FollowUpExecution(), {
        id: 'execution-1',
        status: ExecutionStatus.RETRYING,
      });
      const enrollment = Object.assign(new LeadFollowUpEnrollment(), {
        id: 'enrollment-1',
        executions: [execution],
      });
      const lead = Object.assign(new Lead(), {
        id: 'lead-1',
        interactions: [interaction],
        enrollments: [enrollment],
      });
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [lead],
      });

      const result = await service.getChurnContext('customer-1');

      expect(result.evidence).toEqual([
        expect.objectContaining({
          source: 'interactions',
          signal: 'recorded_interaction_count',
          value: 1,
        }),
        expect.objectContaining({
          source: 'follow_up_executions',
          signal: 'failed_or_retrying_execution_count',
          value: 1,
        }),
      ]);
      expect(result.coverage).toMatchObject({
        interactions: 'AVAILABLE',
        followUps: 'AVAILABLE',
        feedback: 'NOT_CONNECTED',
        issues: 'NOT_CONNECTED',
        renewals: 'NOT_CONNECTED',
      });
    });

    it('marks empty history as no records instead of fabricating evidence', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      const result = await service.getChurnContext('customer-1');

      expect(result.evidence).toEqual([]);
      expect(result.coverage).toMatchObject({
        interactions: 'NO_RECORDS',
        followUps: 'NO_RECORDS',
        feedback: 'NOT_CONNECTED',
        issues: 'NOT_CONNECTED',
      });
    });

    it.each([
      [0, 'LOW'],
      [39, 'LOW'],
      [40, 'MEDIUM'],
      [69, 'MEDIUM'],
      [70, 'HIGH'],
      [100, 'HIGH'],
    ] as const)('classifies score %i as %s', (score, expected) => {
      expect(service.classifyChurnScore(score)).toBe(expected);
    });

    it('classifies a missing score as INSUFFICIENT_DATA', () => {
      expect(service.classifyChurnScore(null)).toBe('INSUFFICIENT_DATA');
    });

    it('does not trust a score without evidence', async () => {
      const saved = Object.assign(new CustomerChurnAssessment(), {
        id: 'assessment-1',
      });
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (churnAssessmentsRepository.create as jest.Mock).mockImplementation(
        (input) => Object.assign(new CustomerChurnAssessment(), input),
      );
      (churnAssessmentsRepository.save as jest.Mock).mockResolvedValue(saved);

      await service.createChurnAssessment('customer-1', {
        score: 95,
        evidence: [],
      });

      expect(churnAssessmentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          score: null,
          riskLevel: 'INSUFFICIENT_DATA',
          evidence: [],
        }),
      );
    });

    it('derives LOW, MEDIUM, and HIGH churn scores from persisted customer context when score is omitted', async () => {
      const recent1 = new Date(Date.now() - 1 * 86_400_000);
      const recent2 = new Date(Date.now() - 2 * 86_400_000);
      const recent3 = new Date(Date.now() - 3 * 86_400_000);
      const stale90 = new Date(Date.now() - 90 * 86_400_000);

      (churnAssessmentsRepository.create as jest.Mock).mockImplementation(
        (input) =>
          Object.assign(new CustomerChurnAssessment(), {
            id: 'assessment-derived',
            ...input,
          }),
      );
      (churnAssessmentsRepository.save as jest.Mock).mockImplementation(
        (assessment) => Promise.resolve(assessment),
      );

      // 1. LOW risk: recent interactions, zero failed follow-ups in persisted customer context
      (customersRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), {
            id: 'lead-low-1',
            interactions: [
              Object.assign(new Interaction(), {
                id: 'int-1',
                occurredAt: recent1,
              }),
              Object.assign(new Interaction(), {
                id: 'int-2',
                occurredAt: recent2,
              }),
              Object.assign(new Interaction(), {
                id: 'int-3',
                occurredAt: recent3,
              }),
            ],
            enrollments: [
              Object.assign(new LeadFollowUpEnrollment(), {
                id: 'enr-1',
                executions: [
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-1',
                    status: ExecutionStatus.SUCCESS,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const lowAssessment = await service.createChurnAssessment(
        'customer-1',
        {},
      );
      expect(lowAssessment.score).toBe(0);
      expect(lowAssessment.riskLevel).toBe('LOW');

      // 2. MEDIUM risk: 2 failed follow-up executions with recent interactions in persisted customer context
      (customersRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), {
            id: 'lead-med-1',
            interactions: [
              Object.assign(new Interaction(), {
                id: 'int-1',
                occurredAt: recent1,
              }),
              Object.assign(new Interaction(), {
                id: 'int-2',
                occurredAt: recent2,
              }),
              Object.assign(new Interaction(), {
                id: 'int-3',
                occurredAt: recent3,
              }),
            ],
            enrollments: [
              Object.assign(new LeadFollowUpEnrollment(), {
                id: 'enr-1',
                executions: [
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-1',
                    status: ExecutionStatus.FAILED,
                  }),
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-2',
                    status: ExecutionStatus.RETRYING,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const mediumAssessment = await service.createChurnAssessment(
        'customer-1',
        {},
      );
      expect(mediumAssessment.score).toBe(50);
      expect(mediumAssessment.riskLevel).toBe('MEDIUM');

      // 3. HIGH risk: stale interaction (>60 days) + failed follow-up execution in persisted customer context
      (customersRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), {
            id: 'lead-high-1',
            interactions: [
              Object.assign(new Interaction(), {
                id: 'int-stale-1',
                occurredAt: stale90,
              }),
            ],
            enrollments: [
              Object.assign(new LeadFollowUpEnrollment(), {
                id: 'enr-1',
                executions: [
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-fail-1',
                    status: ExecutionStatus.FAILED,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const highAssessment = await service.createChurnAssessment(
        'customer-1',
        {},
      );
      expect(highAssessment.score).toBe(95);
      expect(highAssessment.riskLevel).toBe('HIGH');
    });

    it('ignores caller-supplied score and fabricated evidence values in favor of persisted customer records', async () => {
      const recent1 = new Date(Date.now() - 1 * 86_400_000);
      const recent2 = new Date(Date.now() - 2 * 86_400_000);
      const recent3 = new Date(Date.now() - 3 * 86_400_000);

      (churnAssessmentsRepository.create as jest.Mock).mockImplementation(
        (input) =>
          Object.assign(new CustomerChurnAssessment(), {
            id: 'assessment-authoritative',
            ...input,
          }),
      );
      (churnAssessmentsRepository.save as jest.Mock).mockImplementation(
        (assessment) => Promise.resolve(assessment),
      );

      // Persisted DB state: customer has 3 recent interactions and 0 failed follow-ups (authoritative score = 0, LOW)
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), {
            id: 'lead-owned-1',
            interactions: [
              Object.assign(new Interaction(), {
                id: 'int-1',
                occurredAt: recent1,
              }),
              Object.assign(new Interaction(), {
                id: 'int-2',
                occurredAt: recent2,
              }),
              Object.assign(new Interaction(), {
                id: 'int-3',
                occurredAt: recent3,
              }),
            ],
            enrollments: [
              Object.assign(new LeadFollowUpEnrollment(), {
                id: 'enr-1',
                executions: [
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-1',
                    status: ExecutionStatus.SUCCESS,
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      // Caller attempts to override score=95 and fabricate failed_or_retrying_execution_count=10
      const assessment = await service.createChurnAssessment('customer-1', {
        score: 95,
        evidence: [
          {
            source: 'follow_up_executions',
            signal: 'failed_or_retrying_execution_count',
            value: 10,
          },
        ],
      });

      expect(assessment.score).toBe(0);
      expect(assessment.riskLevel).toBe('LOW');
      expect(assessment.evidence).toEqual([
        expect.objectContaining({
          source: 'interactions',
          signal: 'recorded_interaction_count',
          value: 3,
        }),
        expect.objectContaining({
          source: 'follow_up_executions',
          signal: 'failed_or_retrying_execution_count',
          value: 0,
        }),
      ]);
    });

    it('ignores caller-supplied future or past asOfDate so callers cannot manipulate inactivity scoring or bypass the daily uniqueness constraint', async () => {
      const serverToday = new Date().toISOString().slice(0, 10);
      const recent1 = new Date(Date.now() - 1 * 86_400_000);
      const recent2 = new Date(Date.now() - 2 * 86_400_000);
      const recent3 = new Date(Date.now() - 3 * 86_400_000);

      let storedForToday: CustomerChurnAssessment | null = null;
      (churnAssessmentsRepository.create as jest.Mock).mockImplementation(
        (input) =>
          Object.assign(new CustomerChurnAssessment(), {
            id: 'assessment-clock-safe',
            ...input,
          }),
      );
      (churnAssessmentsRepository.save as jest.Mock).mockImplementation(
        (assessment: CustomerChurnAssessment) => {
          storedForToday = assessment;
          return Promise.resolve(assessment);
        },
      );
      (churnAssessmentsRepository.findOne as jest.Mock).mockImplementation(
        ({ where }: { where: { customerId: string; asOfDate: string } }) =>
          Promise.resolve(
            storedForToday &&
              storedForToday.customerId === where.customerId &&
              storedForToday.asOfDate === where.asOfDate
              ? storedForToday
              : null,
          ),
      );

      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), {
            id: 'lead-recent-1',
            interactions: [
              Object.assign(new Interaction(), {
                id: 'int-1',
                occurredAt: recent1,
              }),
              Object.assign(new Interaction(), {
                id: 'int-2',
                occurredAt: recent2,
              }),
              Object.assign(new Interaction(), {
                id: 'int-3',
                occurredAt: recent3,
              }),
            ],
            enrollments: [],
          }),
        ],
      });

      // Caller passes a far-future date ('2099-12-31') attempting to make recent interactions look >60 days stale
      const futureAttempt = await service.createChurnAssessment('customer-1', {
        asOfDate: '2099-12-31',
      });
      expect(futureAttempt.asOfDate).toBe(serverToday);
      expect(futureAttempt.score).toBe(0);
      expect(futureAttempt.riskLevel).toBe('LOW');

      // Caller passes a historical date ('2020-01-01') attempting to create a second daily snapshot
      const pastAttempt = await service.createChurnAssessment('customer-1', {
        asOfDate: '2020-01-01',
      });
      expect(pastAttempt.id).toBe(futureAttempt.id);
      expect(pastAttempt.asOfDate).toBe(serverToday);
      expect(churnAssessmentsRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects cross-customer evidence references with BadRequestException', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), {
            id: 'lead-owned-1',
            interactions: [
              Object.assign(new Interaction(), {
                id: 'int-owned-1',
                occurredAt: new Date('2026-11-09T10:00:00.000Z'),
              }),
            ],
            enrollments: [],
          }),
        ],
      });

      await expect(
        service.createChurnAssessment('customer-1', {
          evidence: [
            {
              customerId: 'customer-other-2',
              source: 'interactions',
              signal: 'recorded_interaction_count',
              value: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createChurnAssessment('customer-1', {
          evidence: [
            {
              interactionId: 'int-foreign-999',
              source: 'interactions',
              signal: 'recorded_interaction_count',
              value: 1,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reaches the retention-task path when WF06 evaluates a customer with high-risk persisted context', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), {
            id: 'lead-high-risk',
            interactions: [],
            enrollments: [
              Object.assign(new LeadFollowUpEnrollment(), {
                id: 'enr-high-1',
                executions: [
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-f1',
                    status: ExecutionStatus.FAILED,
                  }),
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-f2',
                    status: ExecutionStatus.FAILED,
                  }),
                  Object.assign(new FollowUpExecution(), {
                    id: 'exec-f3',
                    status: ExecutionStatus.RETRYING,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      (churnAssessmentsRepository.create as jest.Mock).mockImplementation(
        (input) =>
          Object.assign(new CustomerChurnAssessment(), {
            id: 'assessment-high-1',
            ...input,
          }),
      );
      (churnAssessmentsRepository.save as jest.Mock).mockImplementation(
        (assessment) => Promise.resolve(assessment),
      );
      (churnAssessmentsRepository.findOne as jest.Mock).mockImplementation(
        ({ where }: { where: { id: string; customerId: string } }) =>
          Promise.resolve(
            where.id === 'assessment-high-1' &&
              where.customerId === 'customer-1'
              ? Object.assign(new CustomerChurnAssessment(), {
                  id: 'assessment-high-1',
                  customerId: 'customer-1',
                  score: 75,
                  riskLevel: 'HIGH',
                })
              : null,
          ),
      );
      (customerTasksRepository.findOne as jest.Mock).mockResolvedValue(null);
      (customerTasksRepository.create as jest.Mock).mockImplementation(
        (input) =>
          Object.assign(new CustomerTask(), {
            id: 'task-retention-1',
            ...input,
          }),
      );
      (customerTasksRepository.save as jest.Mock).mockImplementation((task) =>
        Promise.resolve(task),
      );

      // WF06 Node 7 payload omits score and sends only asOfDate, evidence, coverage, metadata
      const assessment = await service.createChurnAssessment('customer-1', {
        asOfDate: '2026-11-10',
        evidence: [
          {
            source: 'follow_up_executions',
            signal: 'failed_or_retrying_execution_count',
            value: 3,
          },
        ],
        coverage: { followUps: 'AVAILABLE' },
        metadata: { correlationId: 'wf06:exec-1:customer-1', source: 'WF06' },
      });

      expect(assessment.score).toBe(75);
      expect(assessment.riskLevel).toBe('HIGH');

      // Downstream WF06 Node 11 condition: riskLevel === 'HIGH' && score !== null && evidence.length > 0
      expect(
        assessment.riskLevel === 'HIGH' &&
          assessment.score !== null &&
          (assessment.evidence?.length ?? 0) > 0,
      ).toBe(true);

      // WF06 Node 12 creates the retention CustomerTask
      const retentionTask = await service.createCustomerTask({
        customerId: 'customer-1',
        assessmentId: assessment.id,
        taskType: 'RETENTION',
        priority: 'HIGH',
        idempotencyKey: `wf06:customer-1:${assessment.id}:RETENTION`,
        notes: 'High churn risk retention follow-up',
        metadata: {
          correlationId: 'wf06:exec-1:customer-1',
          riskLevel: assessment.riskLevel,
          score: assessment.score,
        },
      });

      expect(retentionTask).toEqual(
        expect.objectContaining({
          id: 'task-retention-1',
          customerId: 'customer-1',
          assessmentId: 'assessment-high-1',
          taskType: 'RETENTION',
          priority: 'HIGH',
          status: 'OPEN',
        }),
      );
    });

    it('rejects a score outside the supported range', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      await expect(
        service.createChurnAssessment('customer-1', {
          score: 101,
          evidence: [
            { source: 'interaction', signal: 'recorded_count', value: 1 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reuses an assessment after a duplicate customer/date insert', async () => {
      const serverToday = new Date().toISOString().slice(0, 10);
      const existing = Object.assign(new CustomerChurnAssessment(), {
        id: 'assessment-existing',
        customerId: 'customer-1',
        asOfDate: serverToday,
        score: null,
        riskLevel: 'INSUFFICIENT_DATA',
      });
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (churnAssessmentsRepository.create as jest.Mock).mockImplementation(
        (input) => Object.assign(new CustomerChurnAssessment(), input),
      );
      (churnAssessmentsRepository.save as jest.Mock).mockRejectedValue(
        Object.assign(new Error('unique violation'), { code: '23505' }),
      );
      (churnAssessmentsRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);

      const result = await service.createChurnAssessment('customer-1', {
        score: null,
        asOfDate: '2026-11-09',
      });

      expect(result).toBe(existing);
      expect(churnAssessmentsRepository.findOne).toHaveBeenCalledWith({
        where: { customerId: 'customer-1', asOfDate: serverToday },
      });
    });

    it('scopes assessment history to the Sales actor customer ownership', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (churnAssessmentsRepository.find as jest.Mock).mockResolvedValue([]);

      await service.findChurnAssessments('customer-1', salesActor);

      expect(churnAssessmentsRepository.find).toHaveBeenCalledWith({
        where: { customerId: 'customer-1' },
        order: { assessedAt: 'DESC' },
      });
    });

    it('does not expose churn history for a customer owned by another Sales user', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'another-user',
      });

      await expect(
        service.findChurnAssessments('customer-1', salesActor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(churnAssessmentsRepository.find).not.toHaveBeenCalled();
    });

    it('bounds and paginates the internal churn cohort', async () => {
      (customersRepository.findAndCount as jest.Mock).mockResolvedValue([
        [mockCustomer],
        101,
      ]);

      const result = await service.findChurnCustomerCohort(2, 500);

      expect(customersRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, skip: 100 }),
      );
      expect(result.meta).toEqual({
        page: 2,
        limit: 100,
        total: 101,
        totalPages: 2,
      });
    });

    it('returns only persisted interaction/follow-up evidence and marks unavailable sources', async () => {
      const occurredAt = new Date('2026-10-01T00:00:00.000Z');
      const lead = Object.assign(new Lead(), {
        interactions: [{ type: 'CALL', channel: 'PHONE', occurredAt }],
        enrollments: [
          { executions: [{ status: 'FAILED' }, { status: 'SUCCESS' }] },
        ],
      });
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [lead],
      });

      const context = await service.getChurnContext('customer-1');

      expect(context.evidence).toEqual([
        expect.objectContaining({
          source: 'interactions',
          signal: 'recorded_interaction_count',
          value: 1,
        }),
        expect.objectContaining({
          source: 'follow_up_executions',
          signal: 'failed_or_retrying_execution_count',
          value: 1,
        }),
      ]);
      expect(context.coverage).toMatchObject({
        interactions: 'AVAILABLE',
        followUps: 'AVAILABLE',
        feedback: 'NOT_CONNECTED',
        issues: 'NOT_CONNECTED',
        renewals: 'NOT_CONNECTED',
      });
    });

    it('returns no invented evidence when a customer has no linked history', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        convertedLeads: [],
      });

      const context = await service.getChurnContext('customer-1');

      expect(context.evidence).toEqual([]);
      expect(context.coverage.interactions).toBe('NO_RECORDS');
      expect(context.coverage.feedback).toBe('NOT_CONNECTED');
    });
  });

  describe('customer tasks', () => {
    it('applies task filters and pagination', async () => {
      (customerTasksRepository.find as jest.Mock).mockResolvedValue([]);

      await service.findCustomerTasks({
        customerId: 'customer-1',
        status: 'OPEN',
        taskType: 'RETENTION',
        page: 2,
        limit: 10,
      });

      expect(customerTasksRepository.find).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-1',
          status: 'OPEN',
          taskType: 'RETENTION',
        },
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 10,
      });
    });

    it('rejects a task linked to an assessment belonging to another customer', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (churnAssessmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createCustomerTask({
          customerId: 'customer-1',
          assessmentId: 'assessment-other',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(customerTasksRepository.save).not.toHaveBeenCalled();
    });

    it('rejects idempotency key reuse with a different task payload', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (customerTasksRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'task-1',
        customerId: 'another-customer',
        assessmentId: null,
        taskType: 'RETENTION',
        priority: 'HIGH',
      });

      await expect(
        service.createCustomerTask({
          customerId: 'customer-1',
          idempotencyKey: 'wf06:event-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
