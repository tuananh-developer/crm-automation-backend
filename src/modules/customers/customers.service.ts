import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { Segment } from './entities/segment.entity.js';
import { QueryCustomerDto } from './dto/index.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { CustomerMapper } from './mappers/customer.mapper.js';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,

    @InjectRepository(CustomerSegment)
    private readonly customerSegmentsRepository: Repository<CustomerSegment>,

    @InjectRepository(Segment)
    private readonly segmentsRepository: Repository<Segment>,
  ) {}

  async findAll(
    query: QueryCustomerDto,
  ): Promise<PaginatedResponseDto<CustomerResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.creator', 'creator')
      .leftJoinAndSelect('customer.customerSegments', 'customerSegment')
      .leftJoinAndSelect('customerSegment.segment', 'segment');

    if (query.search) {
      qb.andWhere(
        '(LOWER(customer.name) LIKE LOWER(:search) OR LOWER(customer.email) LIKE LOWER(:search) OR LOWER(customer.companyName) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      qb.andWhere('customer.status = :status', { status: query.status });
    }

    qb.orderBy('customer.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: CustomerMapper.toResponseDtoArray(data),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<CustomerResponseDto> {
    const customer = await this.customersRepository.findOne({
      where: { id },
      relations: {
        creator: true,
        convertedLeads: true,
        customerSegments: {
          segment: true,
          assignedByUser: true,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID '${id}' not found`);
    }

    return CustomerMapper.toResponseDto(
      Object.assign(customer, {
        segmentCount: customer.customerSegments?.length ?? 0,
      }),
    );
  }
}
