import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Segment } from './entities/segment.entity.js';
import { Customer } from './entities/customer.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { User } from '../users/entities/user.entity.js';
import { SegmentAssignmentType } from './enums/customer.enum.js';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  QuerySegmentDto,
  EvaluateSegmentDto,
} from './dto/index.js';

interface EvaluationResult {
  matched: boolean;
  reason: string;
  confidence?: number;
}

interface Condition {
  eq?: any;
  neq?: any;
  in?: any[];
  gte?: number;
  lte?: number;
  gt?: number;
  lt?: number;
  contains?: string;
  startsWith?: string;
  endsWith?: string;
}

@Injectable()
export class SegmentationService {
  private readonly logger = new Logger(SegmentationService.name);

  constructor(
    @InjectRepository(Segment)
    private readonly segmentRepository: Repository<Segment>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerSegment)
    private readonly customerSegmentRepository: Repository<CustomerSegment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateSegmentDto, userId: string): Promise<Segment> {
    const existing = await this.segmentRepository.findOne({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException(
        `Segment with name '${dto.name.trim()}' already exists`,
      );
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found`);
    }

    const segment = this.segmentRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      criteria: dto.criteria ?? null,
      isActive: dto.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.segmentRepository.save(segment);
    this.logger.log(`Created segment ${saved.id} (${saved.name})`);
    return saved;
  }

  async findAll(query: QuerySegmentDto): Promise<{
    data: Segment[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const qb = this.segmentRepository.createQueryBuilder('segment');

    if (query.search && query.search.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(segment.name) LIKE :search OR LOWER(COALESCE(segment.description, '')) LIKE :search)",
        { search },
      );
    }

    if (query.isActive !== undefined) {
      qb.andWhere('segment.isActive = :isActive', { isActive: query.isActive });
    }

    const allowedSortFields = ['createdAt', 'updatedAt', 'name'];
    const sortBy = allowedSortFields.includes(query.sortBy || '')
      ? query.sortBy
      : 'createdAt';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`segment.${sortBy}`, sortOrder);

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return { data, meta: { page, limit, total, totalPages } };
  }

  async findOne(id: string): Promise<Segment> {
    const segment = await this.segmentRepository.findOne({ where: { id } });
    if (!segment) {
      throw new NotFoundException(`Segment with ID '${id}' not found`);
    }
    return segment;
  }

  async update(
    id: string,
    dto: UpdateSegmentDto,
    userId: string,
  ): Promise<Segment> {
    const segment = await this.findOne(id);

    if (dto.name !== undefined && dto.name !== segment.name) {
      const existing = await this.segmentRepository.findOne({
        where: { name: dto.name.trim() },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Segment with name '${dto.name.trim()}' already exists`,
        );
      }
      segment.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      segment.description = dto.description?.trim() ?? null;
    }

    if (dto.criteria !== undefined) {
      segment.criteria = dto.criteria;
    }

    if (dto.isActive !== undefined) {
      segment.isActive = dto.isActive;
    }

    segment.updatedBy = userId;

    const saved = await this.segmentRepository.save(segment);
    this.logger.log(`Updated segment ${saved.id}`);
    return saved;
  }

  async activate(id: string, userId: string): Promise<Segment> {
    return this.update(id, { isActive: true }, userId);
  }

  async deactivate(id: string, userId: string): Promise<Segment> {
    return this.update(id, { isActive: false }, userId);
  }

  async evaluateCustomer(dto: EvaluateSegmentDto): Promise<{
    customer: Customer;
    segment: Segment;
    matched: boolean;
    assignment?: CustomerSegment;
    assignmentType: SegmentAssignmentType;
    confidence?: number;
    reason: string;
  }> {
    const [customer, segment] = await Promise.all([
      this.customerRepository.findOne({ where: { id: dto.customerId } }),
      this.segmentRepository.findOne({ where: { id: dto.segmentId } }),
    ]);

    if (!customer) {
      throw new NotFoundException(
        `Customer with ID '${dto.customerId}' not found`,
      );
    }

    if (!segment) {
      throw new NotFoundException(
        `Segment with ID '${dto.segmentId}' not found`,
      );
    }

    if (!segment.isActive) {
      return {
        customer,
        segment,
        matched: false,
        assignmentType: SegmentAssignmentType.RULE,
        reason: 'Segment is inactive',
      };
    }

    if (!segment.criteria) {
      throw new BadRequestException('Segment has no criteria defined');
    }

    const evaluation = this.evaluateCriteria(customer, segment.criteria);
    const { matched, reason, confidence } = evaluation;

    let assignment: CustomerSegment | undefined;
    if (matched) {
      assignment = await this.assignCustomerToSegment(
        customer,
        segment,
        SegmentAssignmentType.RULE,
        dto.userId ?? null,
        confidence ?? null,
        reason,
      );
    }

    return {
      customer,
      segment,
      matched,
      assignment,
      assignmentType: SegmentAssignmentType.RULE,
      confidence,
      reason,
    };
  }

  private evaluateCriteria(
    customer: Customer,
    criteria: Record<string, any>,
  ): EvaluationResult {
    if (!criteria || Object.keys(criteria).length === 0) {
      return { matched: false, reason: 'No criteria defined' };
    }

    const reasons: string[] = [];
    let allMatch = true;

    for (const [key, condition] of Object.entries(criteria)) {
      const result = this.evaluateCondition(
        customer,
        key,
        condition as Condition,
      );
      if (result.matched) {
        reasons.push(result.reason);
      } else {
        allMatch = false;
        reasons.push(`NOT ${result.reason}`);
      }
    }

    const matched = allMatch;
    const reason = matched
      ? `Customer matched all criteria: ${reasons.join(', ')}`
      : `Customer did not match criteria: ${reasons.join(', ')}`;

    return { matched, reason, confidence: matched ? 1.0 : 0 };
  }

  private evaluateCondition(
    customer: Customer,
    field: string,
    condition: Condition,
  ): EvaluationResult {
    const customerValue = this.getCustomerFieldValue(customer, field);
    if (customerValue === null || customerValue === undefined) {
      return { matched: false, reason: `${field} is null/undefined` };
    }

    if (condition.eq !== undefined) {
      const matched = customerValue === condition.eq;
      return {
        matched,
        reason: `${field} ${matched ? '==' : '!='} ${condition.eq}`,
      };
    }
    if (condition.neq !== undefined) {
      const matched = customerValue !== condition.neq;
      return {
        matched,
        reason: `${field} ${matched ? '!=' : '=='} ${condition.neq}`,
      };
    }
    if (condition.in !== undefined && Array.isArray(condition.in)) {
      const matched = condition.in.includes(customerValue);
      return {
        matched,
        reason: `${field} ${matched ? 'in' : 'not in'} [${condition.in.join(', ')}]`,
      };
    }
    if (condition.gte !== undefined) {
      const matched = Number(customerValue) >= Number(condition.gte);
      return {
        matched,
        reason: `${field} ${matched ? '>=' : '<'} ${condition.gte}`,
      };
    }
    if (condition.lte !== undefined) {
      const matched = Number(customerValue) <= Number(condition.lte);
      return {
        matched,
        reason: `${field} ${matched ? '<=' : '>'} ${condition.lte}`,
      };
    }
    if (condition.gt !== undefined) {
      const matched = Number(customerValue) > Number(condition.gt);
      return {
        matched,
        reason: `${field} ${matched ? '>' : '<='} ${condition.gt}`,
      };
    }
    if (condition.lt !== undefined) {
      const matched = Number(customerValue) < Number(condition.lt);
      return {
        matched,
        reason: `${field} ${matched ? '<' : '>='} ${condition.lt}`,
      };
    }
    if (condition.contains !== undefined) {
      const matched = String(customerValue)
        .toLowerCase()
        .includes(String(condition.contains).toLowerCase());
      return {
        matched,
        reason: `${field} ${matched ? 'contains' : 'does not contain'} ${condition.contains}`,
      };
    }
    if (condition.startsWith !== undefined) {
      const matched = String(customerValue)
        .toLowerCase()
        .startsWith(String(condition.startsWith).toLowerCase());
      return {
        matched,
        reason: `${field} ${matched ? 'starts with' : 'does not start with'} ${condition.startsWith}`,
      };
    }
    if (condition.endsWith !== undefined) {
      const matched = String(customerValue)
        .toLowerCase()
        .endsWith(String(condition.endsWith).toLowerCase());
      return {
        matched,
        reason: `${field} ${matched ? 'ends with' : 'does not end with'} ${condition.endsWith}`,
      };
    }

    return { matched: false, reason: `Unknown condition for ${field}` };
  }

  private getCustomerFieldValue(
    customer: Customer,
    field: string,
  ): string | number | Date | null {
    const fieldMap: Record<string, string | number | Date | null> = {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      companyName: customer.companyName,
      companyWebsite: customer.companyWebsite,
      jobTitle: customer.jobTitle,
      companySize: customer.companySize,
      industry: customer.industry,
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };

    return fieldMap[field];
  }

  async assignCustomerToSegment(
    customer: Customer,
    segment: Segment,
    assignmentType: SegmentAssignmentType,
    assignedBy: string | null,
    confidence: number | null,
    reason: string,
  ): Promise<CustomerSegment> {
    let customerSegment = await this.customerSegmentRepository.findOne({
      where: { customerId: customer.id, segmentId: segment.id },
    });

    if (customerSegment) {
      customerSegment.assignmentType = assignmentType;
      customerSegment.confidence = confidence;
      customerSegment.assignedReason = reason;
      customerSegment.assignedAt = new Date();
      customerSegment.assignedBy = assignedBy;
      customerSegment =
        await this.customerSegmentRepository.save(customerSegment);
      this.logger.log(
        `Updated assignment: Customer ${customer.id} -> Segment ${segment.id} (${assignmentType})`,
      );
    } else {
      customerSegment = this.customerSegmentRepository.create({
        customerId: customer.id,
        segmentId: segment.id,
        assignmentType,
        confidence,
        assignedReason: reason,
        assignedAt: new Date(),
        assignedBy,
      });
      customerSegment =
        await this.customerSegmentRepository.save(customerSegment);
      this.logger.log(
        `Created assignment: Customer ${customer.id} -> Segment ${segment.id} (${assignmentType})`,
      );
    }

    return customerSegment;
  }

  async getCustomerSegments(customerId: string): Promise<CustomerSegment[]> {
    return this.customerSegmentRepository.find({
      where: { customerId },
      relations: { segment: true },
    });
  }

  async getSegmentCustomers(segmentId: string): Promise<CustomerSegment[]> {
    return this.customerSegmentRepository.find({
      where: { segmentId },
      relations: { customer: true },
    });
  }
}
