import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomersService } from './customers.service.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Customer360Status } from './dto/customer-360-callback.dto.js';
import type { Repository } from 'typeorm';
import type { Customer } from './entities/customer.entity.js';
import type { CustomerSegment } from './entities/customer-segment.entity.js';
import type { Segment } from './entities/segment.entity.js';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { Interaction } from '../leads/entities/interaction.entity.js';
import type { LeadQualification } from '../lead-intelligence/entities/lead-qualification.entity.js';
import type { LeadEnrichment } from '../lead-intelligence/entities/lead-enrichment.entity.js';
import type { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import type { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
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
      get: jest.fn().mockReturnValue('test-value'),
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
    );
  });

  describe('findAll', () => {
    it('paginates customers newest first', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockCustomer], 1]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 20 });

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

      await service.findAll({ search: 'acme' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('search'),
        { search: '%acme%' },
      );
    });

    it('applies the status filter', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      (customersRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({ status: 'CONVERTED' });

      expect(qb.andWhere).toHaveBeenCalledWith('customer.status = :status', {
        status: 'CONVERTED',
      });
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

      const result = await service.findOne('customer-1');

      expect(result.convertedLeads).toHaveLength(1);
      expect(result.customerSegments).toHaveLength(2);
      expect(result.segmentCount).toBe(2);
    });

    it('rejects an unknown customer id', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
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
  });

  describe('triggerCustomer360', () => {
    it('creates WorkflowRun with triggeredByUserId from authenticated user and dispatches webhook', async () => {
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      const mockRun = { id: 'run-1', customerId: 'customer-1' };
      (workflowRunsRepository.create as jest.Mock).mockReturnValue(mockRun);
      (workflowRunsRepository.save as jest.Mock).mockResolvedValue(mockRun);

      // Mock global fetch
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(() =>
          Promise.resolve({ ok: true, status: 200 } as Response),
        );

      const result = await service.triggerCustomer360(
        'customer-1',
        mockSalesUser,
      );

      expect(result.workflowRunId).toBe('run-1');
      expect(workflowRunsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 't12-wf05-customer-360',
          customerId: 'customer-1',
          triggeredByUserId: mockSalesUser.id,
          status: WorkflowStatus.PENDING,
        }),
      );

      fetchSpy.mockRestore();
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
  });
});
