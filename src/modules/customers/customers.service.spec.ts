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
});
