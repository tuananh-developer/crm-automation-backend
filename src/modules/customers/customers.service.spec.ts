import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import type { Repository } from 'typeorm';
import type { Customer } from './entities/customer.entity.js';
import type { CustomerSegment } from './entities/customer-segment.entity.js';
import type { Segment } from './entities/segment.entity.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';

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
});
