import { ConflictException, NotFoundException } from '@nestjs/common';
import { SegmentsService } from './segments.service.js';
import type { Repository } from 'typeorm';
import type { Customer } from './entities/customer.entity.js';
import type { Segment } from './entities/segment.entity.js';
import type { CustomerSegment } from './entities/customer-segment.entity.js';
import type { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import type { User } from '../users/entities/user.entity.js';
import { SegmentAssignmentType } from './enums/customer.enum.js';

describe('SegmentsService', () => {
  let service: SegmentsService;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let segmentsRepository: jest.Mocked<Partial<Repository<Segment>>>;
  let customerSegmentsRepository: jest.Mocked<
    Partial<Repository<CustomerSegment>>
  >;
  let leadScoresRepository: jest.Mocked<Partial<Repository<LeadScore>>>;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;

  const mockUser: User = {
    id: 'user-1',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: 'secret-hash',
    role: 'ADMIN' as any,
    status: 'ACTIVE' as any,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
        .mockImplementation((dto) => (dto ?? {}) as CustomerSegment) as any,
      save: jest
        .fn()
        .mockImplementation((item) => Promise.resolve(item)) as any,
      remove: jest
        .fn()
        .mockImplementation((item) => Promise.resolve(item)) as any,
      count: jest.fn().mockResolvedValue(5),
      createQueryBuilder: jest.fn().mockReturnValue(countQb),
    };
    leadScoresRepository = {
      createQueryBuilder: jest.fn(),
    };
    usersRepository = {
      findOne: jest.fn(),
    };

    service = new SegmentsService(
      customersRepository as Repository<Customer>,
      segmentsRepository as Repository<Segment>,
      customerSegmentsRepository as Repository<CustomerSegment>,
      leadScoresRepository as Repository<LeadScore>,
      usersRepository as Repository<User>,
    );
  });

  describe('create', () => {
    it('creates a new segment and strips creator password hash', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(null);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (segmentsRepository.create as jest.Mock).mockReturnValue(mockSegment);
      (segmentsRepository.save as jest.Mock).mockResolvedValue(mockSegment);

      const result = await service.create({
        name: 'Enterprise Tech',
        createdBy: 'user-1',
        criteria: mockSegment.criteria as any,
      });

      expect(result.id).toBe('segment-1');
      expect((result.creator as any)?.passwordHash).toBeUndefined();
    });

    it('rejects duplicate segment name', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);

      await expect(
        service.create({
          name: 'Enterprise Tech',
          createdBy: 'user-1',
          criteria: mockSegment.criteria as any,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('aggregates customer counts in a single group query and strips creator password hash', async () => {
      const qb = createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[mockSegment], 1]);
      (segmentsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(customerSegmentsRepository.createQueryBuilder).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].customerCount).toBe(42);
      expect((result.data[0].creator as any)?.passwordHash).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('returns a single segment with mapped customerCount', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customerSegmentsRepository.count as jest.Mock).mockResolvedValue(5);

      const result = await service.findOne('segment-1');

      expect(result.id).toBe('segment-1');
      expect(result.customerCount).toBe(5);
    });

    it('throws NotFoundException when segment does not exist', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('evaluateCustomer', () => {
    it('matches customer matching the criteria and assigns segment', async () => {
      (segmentsRepository.findOne as jest.Mock).mockResolvedValue(mockSegment);
      (customersRepository.findOne as jest.Mock).mockResolvedValue(mockCustomer);
      (customerSegmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.evaluateCustomer('segment-1', {
        customerId: 'customer-1',
        assignmentType: SegmentAssignmentType.RULE,
      });

      expect(result.matched).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(customerSegmentsRepository.save).toHaveBeenCalled();
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
      (customerSegmentsRepository.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.evaluateCustomer('segment-1', {
        customerId: 'customer-1',
        assignmentType: SegmentAssignmentType.RULE,
      });

      expect(result.matched).toBe(false);
      expect(customerSegmentsRepository.remove).toHaveBeenCalledWith(existing);
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

      const result = await service.evaluateAll('segment-1', {
        assignmentType: SegmentAssignmentType.RULE,
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.total).toBe(2);
      expect(result.matched).toBe(1);
      expect(customerSegmentsRepository.save).toHaveBeenCalled();
    });
  });
});
