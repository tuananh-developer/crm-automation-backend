import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SegmentsService } from './segments.service.js';
import { In } from 'typeorm';
import type { DeepPartial, Repository } from 'typeorm';
import type { Customer } from './entities/customer.entity.js';
import type { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import type { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { ScoreLabel } from '../lead-intelligence/enums/lead-intelligence.enum.js';
import { Lead } from '../leads/entities/lead.entity.js';
import type { User } from '../users/entities/user.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { SegmentAssignmentType } from './enums/customer.enum.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import type { SegmentWorkflowCallbackDto } from './dto/segment-workflow-callback.dto.js';
import type { CreateSegmentDto } from './dto/create-segment.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

describe('SegmentsService', () => {
  let service: SegmentsService;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let segmentsRepository: jest.Mocked<Partial<Repository<Segment>>>;
  let customerSegmentsRepository: jest.Mocked<
    Partial<Repository<CustomerSegment>>
  >;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;
  let workflowRunRepository: jest.Mocked<Partial<Repository<WorkflowRun>>>;

  const mockUser: User = {
    id: 'user-1',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: 'secret-hash',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const adminActor: AuthenticatedUser = {
    id: 'user-1',
    name: 'Admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const salesActor: AuthenticatedUser = {
    ...adminActor,
    id: 'sales-1',
    role: UserRole.SALES,
  };

  const mockSegment: Segment = {
    id: 'segment-1',
    name: 'Enterprise Tech',
    description: 'Enterprise tech companies',
    criteria: {
      logic: 'AND',
      conditions: [
        {
          field: 'industry',
          operator: 'equals',
          value: 'Technology',
        },
      ],
    },
    isActive: true,
    createdBy: 'user-1',
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    creator: mockUser,
  };

  const mockCustomer: Customer = {
    id: 'customer-1',
    name: 'Acme Corp',
    email: 'contact@acme.com',
    phone: '0901234567',
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    jobTitle: 'CTO',
    companySize: 500,
    industry: 'Technology',
    status: 'CONVERTED',
    createdBy: 'user-1',
    updatedBy: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCriteria: CreateSegmentDto['criteria'] = {
    logic: 'AND',
    conditions: [
      {
        id: 'industry-technology',
        field: 'industry',
        operator: 'equals',
        value: 'Technology',
      },
    ],
    assignmentType: 'RULE',
  };

  const createQueryBuilder = () => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  });

  beforeEach(() => {
    customersRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    segmentsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const countQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ segmentId: 'segment-1', count: '42' }]),
    };
    customerSegmentsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((dto: DeepPartial<CustomerSegment>) =>
          Object.assign(new CustomerSegment(), dto),
        ),
      save: jest
        .fn()
        .mockImplementation((item: CustomerSegment) => Promise.resolve(item)),
      remove: jest
        .fn()
        .mockImplementation((item: CustomerSegment) => Promise.resolve(item)),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(5),
      createQueryBuilder: jest.fn().mockReturnValue(countQb),
    };
    usersRepository = {
      findOne: jest.fn(),
    };
    workflowRunRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    service = new SegmentsService(
      customersRepository as Repository<Customer>,
      segmentsRepository as Repository<Segment>,
      customerSegmentsRepository as Repository<CustomerSegment>,
      usersRepository as Repository<User>,
      workflowRunRepository as Repository<WorkflowRun>,
    );
  });

  describe('create', () => {
    it('creates a new segment and strips creator password hash', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (segmentsRepository.create as jest.Mock).mockReturnValue(mockSegment);
      (segmentsRepository.save as jest.Mock).mockResolvedValue(mockSegment);

      const result = await service.create(
        {
          name: 'Enterprise Tech',
          criteria: mockCriteria,
        },
        adminActor,
      );

      expect(segmentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: adminActor.id }),
      );
      expect(result.id).toBe('segment-1');
      expect(result.creator).not.toHaveProperty('passwordHash');
    });

    it('rejects duplicate segment name', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);

      await expect(
        service.create(
          {
            name: 'Enterprise Tech',
            criteria: mockCriteria,
          },
          adminActor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('aggregates customer counts in a single group query and strips creator password hash', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockSegment], 1]);
      (segmentsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 10 }, adminActor);

      expect(customerSegmentsRepository.createQueryBuilder).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].customerCount).toBe(42);
      expect(result.data[0].creator).not.toHaveProperty('passwordHash');
    });

    it('limits Sales segment membership counts to their own Customers', async () => {
      const segmentQb = createQueryBuilder();
      segmentQb.getManyAndCount.mockResolvedValue([[mockSegment], 1]);
      (segmentsRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        segmentQb,
      );
      const countQb = customerSegmentsRepository.createQueryBuilder?.(
        'cs',
      ) as unknown as {
        leftJoin: jest.Mock;
        andWhere: jest.Mock;
        getRawMany: jest.Mock;
      };
      countQb.getRawMany = jest.fn().mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 10 }, salesActor);

      expect(countQb.leftJoin).toHaveBeenCalledWith(
        'cs.customer',
        'countedCustomer',
      );
      expect(countQb.andWhere).toHaveBeenCalledWith(
        'countedCustomer.createdBy = :actorId',
        { actorId: salesActor.id },
      );
    });
  });

  describe('findOne', () => {
    it('returns a single segment with mapped customerCount', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customerSegmentsRepository.count as jest.Mock).mockResolvedValue(5);

      const result = await service.findOne('segment-1', adminActor);

      expect(result.id).toBe('segment-1');
      expect(result.customerCount).toBe(5);
    });

    it('returns a Customer count scoped to the Sales actor', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customerSegmentsRepository.count as jest.Mock).mockResolvedValue(2);

      const result = await service.findOne('segment-1', salesActor);

      expect(customerSegmentsRepository.count).toHaveBeenCalledWith({
        where: {
          segmentId: 'segment-1',
          customer: { createdBy: salesActor.id },
        },
      });
      expect(result.customerCount).toBe(2);
    });

    it('throws NotFoundException when segment does not exist', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findOne('missing-id', adminActor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update and deletion permissions', () => {
    it('records segment updater from the authenticated actor', async () => {
      const salesUser = {
        ...mockUser,
        id: salesActor.id,
        role: UserRole.SALES,
      };
      const segment = { ...mockSegment };
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(segment);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(salesUser);
      (segmentsRepository.save as jest.Mock).mockImplementation((value) =>
        Promise.resolve(value),
      );

      const result = await service.update(
        'segment-1',
        { isActive: false },
        salesActor,
      );

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { id: salesActor.id },
      });
      expect(segmentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedBy: salesActor.id,
          isActive: false,
        }),
      );
      expect(result.updater?.id).toBe(salesActor.id);
    });

    it('does not allow Sales to delete workspace-wide segment memberships', async () => {
      await expect(
        service.remove('segment-1', salesActor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(segmentsRepository.findOne).not.toHaveBeenCalled();
      expect(customerSegmentsRepository.remove).not.toHaveBeenCalled();
    });

    it('allows ADMIN to delete a segment and its membership rows', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customerSegmentsRepository.delete as jest.Mock).mockResolvedValue({
        affected: 1,
      });
      (segmentsRepository.remove as jest.Mock).mockResolvedValue(mockSegment);

      const result = await service.remove('segment-1', adminActor);

      expect(customerSegmentsRepository.delete).toHaveBeenCalledWith({
        segmentId: 'segment-1',
      });
      expect(segmentsRepository.remove).toHaveBeenCalledWith(mockSegment);
      expect(result.id).toBe('segment-1');
    });
  });

  it('scopes segment membership rows returned to Sales', async () => {
    const qb = createQueryBuilder();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
    (
      customerSegmentsRepository.createQueryBuilder as jest.Mock
    ).mockReturnValue(qb);

    await service.getCustomers('segment-1', {}, salesActor);

    expect(qb.andWhere).toHaveBeenCalledWith('customer.createdBy = :actorId', {
      actorId: salesActor.id,
    });
  });

  describe('evaluateCustomer', () => {
    it('rejects evaluation when the segment does not exist', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.evaluateCustomer(
          'missing-segment',
          {
            customerId: 'customer-1',
            assignmentType: SegmentAssignmentType.RULE,
          },
          adminActor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects evaluation when the customer does not exist', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.evaluateCustomer(
          'segment-1',
          {
            customerId: 'missing-customer',
            assignmentType: SegmentAssignmentType.RULE,
          },
          adminActor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns unmatched when the customer field is null', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        industry: null,
      });
      (customerSegmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.evaluateCustomer(
        'segment-1',
        {
          customerId: 'customer-1',
          assignmentType: SegmentAssignmentType.RULE,
        },
        adminActor,
      );

      expect(result.matched).toBe(false);
      expect(customerSegmentsRepository.save).not.toHaveBeenCalled();
    });

    it('rejects AI evaluation when AI segmentation is not configured', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );

      await expect(
        service.evaluateCustomer(
          'segment-1',
          {
            customerId: 'customer-1',
            assignmentType: SegmentAssignmentType.AI,
          },
          adminActor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('matches customer matching the criteria and assigns segment', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue(
        mockCustomer,
      );
      (customerSegmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.evaluateCustomer(
        'segment-1',
        {
          customerId: 'customer-1',
          assignmentType: SegmentAssignmentType.RULE,
        },
        adminActor,
      );

      expect(result.matched).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(customerSegmentsRepository.save).toHaveBeenCalled();
    });

    it('records the authenticated Sales actor on membership assignment', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: salesActor.id,
      });
      (customerSegmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await service.evaluateCustomer(
        'segment-1',
        {
          customerId: 'customer-1',
          assignmentType: SegmentAssignmentType.RULE,
        },
        salesActor,
      );

      expect(customerSegmentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ assignedBy: salesActor.id }),
      );
    });

    it('removes assignment when customer does not match criteria', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        industry: 'Healthcare',
      });
      const existing = {
        id: 'cs-1',
        customerId: 'customer-1',
        segmentId: 'segment-1',
      } as unknown as CustomerSegment;
      (customerSegmentsRepository.findOne as jest.Mock).mockResolvedValue(
        existing,
      );

      const result = await service.evaluateCustomer(
        'segment-1',
        {
          customerId: 'customer-1',
          assignmentType: SegmentAssignmentType.RULE,
        },
        adminActor,
      );

      expect(result.matched).toBe(false);
      expect(customerSegmentsRepository.remove).toHaveBeenCalledWith(existing);
    });

    it('denies Sales evaluation of customers created by another user', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockCustomer,
        createdBy: 'another-user',
      });

      await expect(
        service.evaluateCustomer(
          'segment-1',
          {
            customerId: 'customer-1',
            assignmentType: SegmentAssignmentType.RULE,
          },
          salesActor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(customerSegmentsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('evaluateAll', () => {
    it('batches customers and evaluates them efficiently', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.find as jest.Mock).mockResolvedValue([
        mockCustomer,
        { ...mockCustomer, id: 'customer-2', industry: 'Retail' },
      ]);
      (customerSegmentsRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.evaluateAll(
        'segment-1',
        {
          assignmentType: SegmentAssignmentType.RULE,
        },
        adminActor,
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.total).toBe(2);
      expect(result.matched).toBe(1);
      expect(customerSegmentsRepository.save).toHaveBeenCalled();
    });

    it('uses the newest preloaded lead score when evaluating a batch', async () => {
      const scoreSegment: Segment = {
        ...mockSegment,
        criteria: {
          logic: 'AND',
          conditions: [
            {
              id: 'high-score',
              field: 'score',
              operator: 'greater_than_or_equal',
              value: '80',
            },
          ],
        },
      };
      const leadScores: LeadScore[] = [
        {
          id: 'score-old',
          leadId: 'lead-1',
          workflowRunId: null,
          score: 95,
          label: ScoreLabel.HOT,
          reason: null,
          modelProvider: null,
          modelName: null,
          modelVersion: null,
          scoringFeatures: null,
          inputSnapshot: null,
          outputSnapshot: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'score-new',
          leadId: 'lead-1',
          workflowRunId: null,
          score: 70,
          label: ScoreLabel.WARM,
          reason: null,
          modelProvider: null,
          modelName: null,
          modelVersion: null,
          scoringFeatures: null,
          inputSnapshot: null,
          outputSnapshot: null,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ];
      const customerWithScores: Customer = {
        ...mockCustomer,
        convertedLeads: [
          Object.assign(new Lead(), { id: 'lead-1', scores: leadScores }),
        ],
      };

      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(scoreSegment);
      (customersRepository.find as jest.Mock).mockResolvedValue([
        customerWithScores,
      ]);
      (customerSegmentsRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.evaluateAll(
        'segment-1',
        {
          assignmentType: SegmentAssignmentType.RULE,
        },
        adminActor,
      );

      expect(result.matched).toBe(0);
      expect(customerSegmentsRepository.find).toHaveBeenCalledTimes(1);
      expect(customerSegmentsRepository.save).not.toHaveBeenCalled();
    });

    it('treats an explicitly empty customer ID list as an empty batch', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);

      const result = await service.evaluateAll(
        'segment-1',
        {
          assignmentType: SegmentAssignmentType.RULE,
          customerIds: [],
        },
        adminActor,
      );

      expect(result.total).toBe(0);
      expect(result.processed).toBe(0);
      expect(result.matched).toBe(0);
      expect(customersRepository.find).not.toHaveBeenCalled();
      expect(customerSegmentsRepository.find).not.toHaveBeenCalled();
    });

    it('deduplicates explicit customer IDs before fetching the batch', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.find as jest.Mock).mockResolvedValue([mockCustomer]);
      (customerSegmentsRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.evaluateAll(
        'segment-1',
        {
          assignmentType: SegmentAssignmentType.RULE,
          customerIds: ['customer-1', 'customer-1'],
        },
        adminActor,
      );

      expect(result.total).toBe(1);
      expect(customersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: [{ id: 'customer-1' }] }),
      );
    });

    it('restricts Sales bulk evaluation to owned Customers', async () => {
      const ownCustomer = { ...mockCustomer, createdBy: salesActor.id };
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.find as jest.Mock).mockResolvedValue([ownCustomer]);
      (customerSegmentsRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.evaluateAll(
        'segment-1',
        { assignmentType: SegmentAssignmentType.RULE },
        salesActor,
      );

      expect(customersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdBy: salesActor.id } }),
      );
      expect(result.total).toBe(1);
      expect(customerSegmentsRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ assignedBy: salesActor.id }),
        ]),
      );
    });

    it('rejects explicit Customer IDs outside the Sales actor scope', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.find as jest.Mock).mockResolvedValue([]);

      await expect(
        service.evaluateAll(
          'segment-1',
          {
            assignmentType: SegmentAssignmentType.RULE,
            customerIds: ['customer-other'],
          },
          salesActor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(customersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [{ id: 'customer-other', createdBy: salesActor.id }],
        }),
      );
      expect(customerSegmentsRepository.save).not.toHaveBeenCalled();
    });

    it('processes 51 customers in batches of 50 and 1', async () => {
      const customers = Array.from({ length: 51 }, (_, index) => ({
        ...mockCustomer,
        id: `customer-${index}`,
      }));
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.find as jest.Mock).mockResolvedValue(customers);
      (customerSegmentsRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.evaluateAll(
        'segment-1',
        {
          assignmentType: SegmentAssignmentType.RULE,
        },
        adminActor,
      );

      expect(result.processed).toBe(51);
      expect(result.matched).toBe(51);
      expect(customerSegmentsRepository.find).toHaveBeenNthCalledWith(1, {
        where: {
          segmentId: 'segment-1',
          customerId: In(customers.slice(0, 50).map(({ id }) => id)),
        },
      });
      expect(customerSegmentsRepository.find).toHaveBeenNthCalledWith(2, {
        where: {
          segmentId: 'segment-1',
          customerId: In(['customer-50']),
        },
      });
      expect(customerSegmentsRepository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('workflow callbacks', () => {
    it('creates one run for an idempotency key', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValue(null);
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (workflowRunRepository.create as jest.Mock).mockImplementation(
        (value) => ({ ...value, id: 'workflow-run-1' }),
      );
      (workflowRunRepository.save as jest.Mock).mockImplementation((value) =>
        Promise.resolve(value),
      );

      const result = await service.createWorkflowRun(
        'segment-1',
        'wf07-execution-1',
      );

      expect(workflowRunRepository.findOne).toHaveBeenCalledWith({
        where: { idempotencyKey: 'wf07-execution-1' },
      });
      expect(workflowRunRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 'WF07_CUSTOMER_SEGMENTATION',
          idempotencyKey: 'wf07-execution-1',
          status: WorkflowStatus.RUNNING,
        }),
      );
      expect(result.workflowRunId).toBe('workflow-run-1');
    });

    it('rejects a callback whose run belongs to another segment', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'workflow-run-1',
        workflowName: 'WF07_CUSTOMER_SEGMENTATION',
        inputPayload: { segmentId: 'another-segment' },
        status: WorkflowStatus.RUNNING,
      });

      await expect(
        service.handleWorkflowCallback({
          workflowRunId: 'workflow-run-1',
          segmentId: 'segment-1',
          segmentName: 'Enterprise Tech',
          status: 'SUCCESS',
          statistics: {
            total: 0,
            processed: 0,
            matched: 0,
            unmatched: 0,
            matchRate: '0%',
          },
          aiInsights: [],
          rejectedInsights: 0,
        } satisfies SegmentWorkflowCallbackDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(workflowRunRepository.save).not.toHaveBeenCalled();
    });

    it('persists a successful callback and ignores duplicate terminal callbacks', async () => {
      const run = Object.assign(new WorkflowRun(), {
        id: 'workflow-run-1',
        workflowName: 'WF07_CUSTOMER_SEGMENTATION',
        inputPayload: { segmentId: 'segment-1' },
        outputPayload: null,
        status: WorkflowStatus.RUNNING,
        finishedAt: null,
        errorMessage: null,
      });
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValue(run);
      (workflowRunRepository.save as jest.Mock).mockImplementation((value) =>
        Promise.resolve(value),
      );
      const callback: SegmentWorkflowCallbackDto = {
        workflowRunId: run.id,
        segmentId: 'segment-1',
        segmentName: 'Enterprise Tech',
        status: 'SUCCESS',
        statistics: {
          total: 1,
          processed: 1,
          matched: 1,
          unmatched: 0,
          matchRate: '100%',
        },
        aiInsights: [],
        rejectedInsights: 0,
      };

      const result = await service.handleWorkflowCallback(callback);
      const duplicate = await service.handleWorkflowCallback(callback);

      expect(result.status).toBe(WorkflowStatus.SUCCESS);
      expect(duplicate).toEqual(result);
      expect(workflowRunRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty run idempotency key', async () => {
      await expect(
        service.createWorkflowRun('segment-1', ' '),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workflowRunRepository.save).not.toHaveBeenCalled();
    });
  });
});
