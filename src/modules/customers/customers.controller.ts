import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

interface CustomerListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CustomerListResponse {
  data: Customer[];
  meta: CustomerListMeta;
}

interface CustomerConvertedLead {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  status: string;
  sourceId: string;
  createdAt: Date;
}

interface CustomerSegmentMembership {
  customerId: string;
  segmentId: string;
  assignmentType: string;
  confidence: string | number | null;
  assignedReason: string | null;
  assignedAt: Date;
  assignedBy: string | null;
  segment?: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  } | null;
  assignedByUser?: { id: string; name?: string | null } | null;
}

interface CustomerDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  jobTitle: string | null;
  companySize: number | null;
  industry: string | null;
  status: string | null;
  createdBy: string;
  updatedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: { id: string; name?: string | null; email?: string | null } | null;
  convertedLeads: CustomerConvertedLead[];
  customerSegments: CustomerSegmentMembership[];
  segmentCount: number;
}

@ApiTags('Customers')
@ApiBearerAuth('JWT-auth')
@Controller('customers')
export class CustomersController {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(CustomerSegment)
    private readonly customerSegmentRepository: Repository<CustomerSegment>,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all customers',
    description:
      'Returns a paginated list of customers with optional filtering, search, and status filter',
  })
  @ApiOkResponse({ description: 'Customers retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'acme' })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    example: 'ACTIVE',
  })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ): Promise<CustomerListResponse> {
    const pageNum = page && parseInt(page, 10) > 0 ? parseInt(page, 10) : 1;
    const limitNum =
      limit && parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 10;
    const skip = (pageNum - 1) * limitNum;

    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.creator', 'creator');

    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(customer.name) LIKE :search OR LOWER(customer.email) LIKE :search OR LOWER(COALESCE(customer.companyName, '')) LIKE :search)",
        { search: searchTerm },
      );
    }

    if (status && status.trim()) {
      qb.andWhere('customer.status = :status', { status: status.trim() });
    }

    qb.orderBy('customer.createdAt', 'DESC');

    const [data, total] = await qb.skip(skip).take(limitNum).getManyAndCount();
    const totalPages = Math.ceil(total / limitNum) || 1;

    return {
      data,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a customer by ID',
    description:
      'Returns a single customer with converted leads and segment memberships',
  })
  @ApiOkResponse({ description: 'Customer found' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Customer UUID',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerDetail> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: { creator: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID '${id}' not found`);
    }

    // Get converted leads
    const convertedLeads = await this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.convertedCustomerId = :customerId', {
        customerId: customer.id,
      })
      .select([
        'lead.id',
        'lead.firstName',
        'lead.lastName',
        'lead.email',
        'lead.phone',
        'lead.status',
        'lead.sourceId',
        'lead.createdAt',
      ])
      .getMany();

    // Get customer segment memberships
    const customerSegments = await this.customerSegmentRepository.find({
      where: { customerId: customer.id },
      relations: { segment: true, assignedByUser: true },
    });

    const customerSegmentMemberships: CustomerSegmentMembership[] =
      customerSegments.map((cs) => ({
        customerId: cs.customerId,
        segmentId: cs.segmentId,
        assignmentType: cs.assignmentType,
        confidence: cs.confidence,
        assignedReason: cs.assignedReason,
        assignedAt: cs.assignedAt,
        assignedBy: cs.assignedBy,
        segment: cs.segment
          ? {
              id: cs.segment.id,
              name: cs.segment.name,
              description: cs.segment.description,
              isActive: cs.segment.isActive,
            }
          : null,
        assignedByUser: cs.assignedByUser
          ? { id: cs.assignedByUser.id, name: cs.assignedByUser.name }
          : null,
      }));

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      companyName: customer.companyName,
      companyWebsite: customer.companyWebsite,
      jobTitle: customer.jobTitle,
      companySize: customer.companySize,
      industry: customer.industry,
      status: customer.status,
      createdBy: customer.createdBy,
      updatedBy: customer.updatedBy,
      notes: customer.notes,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      creator: customer.creator
        ? {
            id: customer.creator.id,
            name: customer.creator.name,
            email: customer.creator.email,
          }
        : null,
      convertedLeads: convertedLeads.map((lead) => ({
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        sourceId: lead.sourceId,
        createdAt: lead.createdAt,
      })),
      customerSegments: customerSegmentMemberships,
      segmentCount: customerSegmentMemberships.length,
    };
  }
}
