import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import type { Repository } from 'typeorm';
import type { Customer } from './entities/customer.entity.js';
import type { CustomerSegment } from './entities/customer-segment.entity.js';
import type { Segment } from './entities/segment.entity.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { ExecutionStatus } from '../follow-up/enums/follow-up.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';

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
    createdBy: 'user-1',
    updatedBy: null,
    notes: null,
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
    updatedAt: new Date('2026-10-03T00:00:00.000Z'),
  };
  const adminActor: AuthenticatedUser = {
    id: 'admin-1',
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
    id: 'user-1',
    role: UserRole.SALES,
  };

  const createQueryBuilder = () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    return qb;
  };

  beforeEach(() => {
    customersRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
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

    service = new CustomersService(
      customersRepository as Repository<Customer>,
      customerSegmentsRepository as Repository<CustomerSegment>,
      segmentsRepository as Repository<Segment>,
      churnAssessmentsRepository as Repository<CustomerChurnAssessment>,
      customerTasksRepository as Repository<CustomerTask>,
    );
  });

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
      {
        search: '%acme%',
      },
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

    expect(qb.andWhere).toHaveBeenCalledWith('customer.createdBy = :actorId', {
      actorId: salesActor.id,
    });
  });

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

  it('counts zero segments when the customer has none', async () => {
    (customersRepository.findOne as jest.Mock).mockResolvedValue({
      ...mockCustomer,
      customerSegments: [],
    });

    const result = await service.findOne('customer-1', adminActor);

    expect(result.segmentCount).toBe(0);
  });

  it('rejects an unknown customer id', async () => {
    (customersRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.findOne('missing', adminActor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
      const existing = Object.assign(new CustomerChurnAssessment(), {
        id: 'assessment-existing',
        customerId: 'customer-1',
        asOfDate: '2026-11-09',
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
      (churnAssessmentsRepository.findOne as jest.Mock).mockResolvedValue(
        existing,
      );

      const result = await service.createChurnAssessment('customer-1', {
        score: null,
        asOfDate: '2026-11-09',
      });

      expect(result).toBe(existing);
      expect(churnAssessmentsRepository.findOne).toHaveBeenCalledWith({
        where: { customerId: 'customer-1', asOfDate: '2026-11-09' },
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
