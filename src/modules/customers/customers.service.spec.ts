import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import type { Repository } from 'typeorm';
import type { Customer } from './entities/customer.entity.js';
import type { CustomerSegment } from './entities/customer-segment.entity.js';
import type { Segment } from './entities/segment.entity.js';

describe('CustomersService', () => {
  let service: CustomersService;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let customerSegmentsRepository: jest.Mocked<
    Partial<Repository<CustomerSegment>>
  >;
  let segmentsRepository: jest.Mocked<Partial<Repository<Segment>>>;

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
    createdBy: 'user-1',
    updatedBy: null,
    notes: null,
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
    updatedAt: new Date('2026-10-03T00:00:00.000Z'),
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
    };
    customerSegmentsRepository = {};
    segmentsRepository = {};

    service = new CustomersService(
      customersRepository as Repository<Customer>,
      customerSegmentsRepository as Repository<CustomerSegment>,
      segmentsRepository as Repository<Segment>,
    );
  });

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
      {
        search: '%acme%',
      },
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

  it('counts zero segments when the customer has none', async () => {
    (customersRepository.findOne as jest.Mock).mockResolvedValue({
      ...mockCustomer,
      customerSegments: [],
    });

    const result = await service.findOne('customer-1');

    expect(result.segmentCount).toBe(0);
  });

  it('rejects an unknown customer id', async () => {
    (customersRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('classifies churn thresholds as required', () => {
    expect(service.classifyChurnScore(0)).toBe('LOW');
    expect(service.classifyChurnScore(39)).toBe('LOW');
    expect(service.classifyChurnScore(40)).toBe('MEDIUM');
    expect(service.classifyChurnScore(69)).toBe('MEDIUM');
    expect(service.classifyChurnScore(70)).toBe('HIGH');
    expect(service.classifyChurnScore(100)).toBe('HIGH');
    expect(() => service.classifyChurnScore(101)).toThrow();
    expect(() => service.classifyChurnScore(Number.NaN)).toThrow();
    expect(() =>
      service.classifyChurnScore(Number.POSITIVE_INFINITY),
    ).toThrow();
    const invalidScore = 'high' as unknown as number;
    expect(() => service.classifyChurnScore(invalidScore)).toThrow();
  });

  it('returns insufficient data when evidence is not strong enough', () => {
    const missingScore = null as unknown as number;
    expect(service.classifyChurnScore(missingScore)).toBe('INSUFFICIENT_DATA');
  });

  it('creates a retention task only for high-risk valid assessments', async () => {
    const assessRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((dto) => ({ ...dto, id: 'assessment-1' })),
    };
    const taskRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((dto) => ({ ...dto, id: 'task-1' })),
    };

    const serviceWithRepos = new CustomersService(
      customersRepository as Repository<Customer>,
      customerSegmentsRepository as Repository<CustomerSegment>,
      segmentsRepository as Repository<Segment>,
      assessRepo as unknown as Repository<any>,
      taskRepo as unknown as Repository<any>,
    );

    const task = await serviceWithRepos.ensureRetentionTask({
      customerId: 'customer-1',
      assessmentId: 'assessment-1',
      riskLevel: 'HIGH',
      score: 80,
      evidence: [{ type: 'engagement', summary: 'Low engagement' }],
      idempotencyKey: 'customer-1:assessment-1:retention',
    });

    expect(task).not.toBeNull();
    expect(task?.taskType).toBe('RETENTION');
    expect(task?.status).toBe('OPEN');
    expect(task?.idempotencyKey).toBe('customer-1:assessment-1:retention');

    await expect(
      serviceWithRepos.ensureRetentionTask({
        customerId: 'customer-1',
        assessmentId: 'assessment-1',
        riskLevel: 'HIGH',
        score: 80,
        evidence: [{ type: 'engagement', summary: 'Low engagement' }],
        idempotencyKey: 'customer-1:assessment-1:retention',
      }),
    ).resolves.toMatchObject({ taskType: 'RETENTION' });

    await expect(
      serviceWithRepos.ensureRetentionTask({
        customerId: 'customer-1',
        assessmentId: 'assessment-2',
        riskLevel: 'LOW',
        score: 20,
        evidence: [{ type: 'engagement', summary: 'Stable' }],
        idempotencyKey: 'customer-1:assessment-2:retention',
      }),
    ).resolves.toBeNull();
  });

  it('returns the existing retention task if the unique idempotency key collides', async () => {
    const assessRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((dto) => ({ ...dto, id: 'assessment-1' })),
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'task-123',
        customerId: 'customer-1',
        assessmentId: 'assessment-1',
        taskType: 'RETENTION',
        status: 'OPEN',
        idempotencyKey: 'customer-1:assessment-1:retention',
      }),
      create: jest.fn((dto) => dto),
      save: jest
        .fn()
        .mockRejectedValue(
          new Error('duplicate key value violates unique constraint'),
        ),
    };

    const serviceWithRepos = new CustomersService(
      customersRepository as Repository<Customer>,
      customerSegmentsRepository as Repository<CustomerSegment>,
      segmentsRepository as Repository<Segment>,
      assessRepo as unknown as Repository<any>,
      taskRepo as unknown as Repository<any>,
    );

    const task = await serviceWithRepos.ensureRetentionTask({
      customerId: 'customer-1',
      assessmentId: 'assessment-1',
      riskLevel: 'HIGH',
      score: 85,
      evidence: [{ type: 'engagement', summary: 'Very low engagement' }],
      idempotencyKey: 'customer-1:assessment-1:retention',
    });

    expect(task).toMatchObject({
      id: 'task-123',
      taskType: 'RETENTION',
      idempotencyKey: 'customer-1:assessment-1:retention',
    });
  });
});
