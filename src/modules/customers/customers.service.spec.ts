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
import type { Lead } from '../leads/entities/lead.entity.js';
import type { Interaction } from '../leads/entities/interaction.entity.js';
import type { LeadQualification } from '../lead-intelligence/entities/lead-qualification.entity.js';
import type { LeadEnrichment } from '../lead-intelligence/entities/lead-enrichment.entity.js';
import type { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import type { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import type { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

describe('CustomersService', () => {
  let service: CustomersService;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let customerSegmentsRepository: jest.Mocked<
    Partial<Repository<CustomerSegment>>
  >;
  let segmentsRepository: jest.Mocked<Partial<Repository<Segment>>>;
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
      query: jest.fn(),
    };
    customerSegmentsRepository = {};
    segmentsRepository = {};
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
      leadsRepository as Repository<Lead>,
      interactionsRepository as Repository<Interaction>,
      qualificationsRepository as Repository<LeadQualification>,
      enrichmentsRepository as Repository<LeadEnrichment>,
      scoresRepository as Repository<LeadScore>,
      workflowRunsRepository as Repository<WorkflowRun>,
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
      (workflowRunsRepository.create as jest.Mock).mockReturnValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const fetchSpy = jest.spyOn(global, 'fetch');

      const result = await service.triggerCustomer360(
        'customer-1',
        mockSalesUser,
      );

      expect(result.workflowRunId).toBe('run-1');
      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      expect(workflowRunsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 't12-wf05-customer-360',
          customerId: 'customer-1',
          triggeredByUserId: mockSalesUser.id,
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
        service.triggerCustomer360('customer-1', mockSalesUser),
      ).rejects.toThrow('Outbox broker table locked / write failed');

      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws InternalServerErrorException when N8N_API_KEY is missing (Fail-Closed)', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await expect(
        service.triggerCustomer360('customer-1', mockSalesUser),
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

    it('creates distinct WorkflowRuns with null idempotencyKey when Idempotency-Key header is omitted', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (workflowRunsRepository.create as jest.Mock)
        .mockReturnValueOnce({
          id: 'run-unkeyed-1',
          customerId: 'customer-1',
          idempotencyKey: null,
        })
        .mockReturnValueOnce({
          id: 'run-unkeyed-2',
          customerId: 'customer-1',
          idempotencyKey: null,
        });
      (workflowRunsRepository.save as jest.Mock)
        .mockResolvedValueOnce({
          id: 'run-unkeyed-1',
          customerId: 'customer-1',
          idempotencyKey: null,
        })
        .mockResolvedValueOnce({
          id: 'run-unkeyed-2',
          customerId: 'customer-1',
          idempotencyKey: null,
        });

      const first = await service.triggerCustomer360(
        'customer-1',
        mockSalesUser,
      );
      const second = await service.triggerCustomer360(
        'customer-1',
        mockSalesUser,
      );

      expect(first.workflowRunId).toBe('run-unkeyed-1');
      expect(second.workflowRunId).toBe('run-unkeyed-2');
      expect(workflowRunsRepository.findOne).not.toHaveBeenCalled();
      expect(workflowRunsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: null }),
      );
      expect(dispatcherMock.enqueue).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when Idempotency-Key header is blank', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      await expect(
        service.triggerCustomer360('customer-1', mockSalesUser, '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });
  });

  describe('handleCustomer360Callback', () => {
    it('successfully processes callback and marks WorkflowRun as SUCCESS', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun: any = {
        id: 'run-1',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.PENDING,
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-1',
        status: Customer360Status.SUCCESS,
        summary: 'Excellent enterprise profile',
      });

      expect(result.success).toBe(true);
      expect(result.customerId).toBe('customer-1');
      expect(mockRun.status).toBe(WorkflowStatus.SUCCESS);
      expect(mockRun.outputPayload.summary).toBe(
        'Excellent enterprise profile',
      );
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

    it('rejects callback when WorkflowRun claim lease has expired', async () => {
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
        status: WorkflowStatus.PENDING,
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-1',
        status: Customer360Status.FAILED,
        errorMessage: 'Gemini AI rate limit exceeded',
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
      };
      (workflowRunsRepository.findOne as jest.Mock).mockResolvedValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      const result = await service.handleCustomer360Callback({
        customerId: 'customer-1',
        workflowRunId: 'run-running',
        status: Customer360Status.SUCCESS,
        summary: 'Running to success profile',
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
        status: WorkflowStatus.PENDING,
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
        leadsRepository as Repository<Lead>,
        interactionsRepository as Repository<Interaction>,
        qualificationsRepository as Repository<LeadQualification>,
        enrichmentsRepository as Repository<LeadEnrichment>,
        scoresRepository as Repository<LeadScore>,
        workflowRunsRepository as Repository<WorkflowRun>,
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
      });

      expect(result.success).toBe(true);
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockRunsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'run-locked' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockRunsRepo.save).toHaveBeenCalled();
    });

    it('returns idempotent response for duplicate SUCCESS callback with matching payload', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockCompletedRun: any = {
        id: 'run-success',
        customerId: 'customer-1',
        workflowName: 't12-wf05-customer-360',
        status: WorkflowStatus.SUCCESS,
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
      });

      expect(result.success).toBe(true);
      expect(result.workflowRunId).toBe('run-success');
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
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
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockFailedRun.status).toBe(WorkflowStatus.FAILED);
      expect(workflowRunsRepository.save).not.toHaveBeenCalled();
    });
  });
});
