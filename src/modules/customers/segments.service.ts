import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  CreateSegmentDto,
  EvaluateSegmentBulkDto,
  EvaluateSegmentDto,
  QuerySegmentDto,
  UpdateSegmentDto,
} from './dto/index.js';
import { SegmentAssignmentType } from './enums/customer.enum.js';

@Injectable()
export class SegmentsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,

    @InjectRepository(Segment)
    private readonly segmentsRepository: Repository<Segment>,

    @InjectRepository(CustomerSegment)
    private readonly customerSegmentsRepository: Repository<CustomerSegment>,

    @InjectRepository(LeadScore)
    private readonly leadScoresRepository: Repository<LeadScore>,

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateSegmentDto): Promise<Segment> {
    const user = await this.usersRepository.findOne({
      where: { id: dto.createdBy },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${dto.createdBy}' not found`);
    }

    const existing = await this.segmentsRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Segment with name '${dto.name}' already exists`,
      );
    }

    const segment = this.segmentsRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      criteria: dto.criteria,
      isActive: dto.isActive ?? true,
      createdBy: dto.createdBy,
      updatedBy: null,
    });

    return this.segmentsRepository.save(segment);
  }

  async findAll(query: QuerySegmentDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.segmentsRepository
      .createQueryBuilder('segment')
      .leftJoinAndSelect('segment.creator', 'creator')
      .leftJoinAndSelect('segment.updater', 'updater');

    if (query.search) {
      qb.andWhere(
        '(LOWER(segment.name) LIKE LOWER(:search) OR LOWER(segment.description) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    if (query.isActive !== undefined) {
      qb.andWhere('segment.is_active = :isActive', {
        isActive: query.isActive,
      });
    }

    qb.orderBy('segment.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    const dataWithCount = await Promise.all(
      data.map(async (segment) => {
        const customerCount = await this.customerSegmentsRepository.count({
          where: { segmentId: segment.id },
        });

        return this.withoutUserHashes({
          ...segment,
          customerCount,
        });
      }),
    );

    return {
      data: dataWithCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Segment & { customerCount: number }> {
    const segment = await this.segmentsRepository.findOne({
      where: { id },
      relations: {
        creator: true,
        updater: true,
      },
    });

    if (!segment) {
      throw new NotFoundException(`Segment with ID '${id}' not found`);
    }

    const customerCount = await this.customerSegmentsRepository.count({
      where: { segmentId: id },
    });

    return this.withoutUserHashes({
      ...segment,
      customerCount,
    });
  }

  async update(id: string, dto: UpdateSegmentDto): Promise<Segment> {
    const segment = await this.segmentsRepository.findOne({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException(`Segment with ID '${id}' not found`);
    }

    if (dto.name && dto.name !== segment.name) {
      const existing = await this.segmentsRepository.findOne({
        where: { name: dto.name },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Segment with name '${dto.name}' already exists`,
        );
      }
    }

    if (dto.createdBy) {
      const user = await this.usersRepository.findOne({
        where: { id: dto.createdBy },
      });

      if (!user) {
        throw new NotFoundException(
          `User with ID '${dto.createdBy}' not found`,
        );
      }

      segment.updatedBy = dto.createdBy;
    }

    if (dto.name !== undefined) {
      segment.name = dto.name;
    }

    if (dto.description !== undefined) {
      segment.description = dto.description ?? null;
    }

    if (dto.criteria !== undefined) {
      segment.criteria = dto.criteria;
    }

    if (dto.isActive !== undefined) {
      segment.isActive = dto.isActive;
    }

    return this.segmentsRepository.save(segment);
  }

  async remove(id: string) {
    const segment = await this.segmentsRepository.findOne({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException(`Segment with ID '${id}' not found`);
    }

    await this.customerSegmentsRepository.delete({ segmentId: id });
    await this.segmentsRepository.remove(segment);

    return {
      message: 'Segment deleted successfully',
      id,
    };
  }

  async getCustomers(segmentId: string, query: QuerySegmentDto) {
    await this.ensureSegmentExists(segmentId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.customerSegmentsRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.customer', 'customer')
      .leftJoinAndSelect('assignment.segment', 'segment')
      .leftJoinAndSelect('assignment.assignedByUser', 'assignedByUser')
      .where('assignment.segment_id = :segmentId', { segmentId });

    if (query.search) {
      qb.andWhere(
        '(LOWER(customer.name) LIKE LOWER(:search) OR LOWER(customer.email) LIKE LOWER(:search) OR LOWER(customer.company_name) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('assignment.assigned_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async evaluateCustomer(segmentId: string, dto: EvaluateSegmentDto) {
    const segment = await this.getSegmentForEvaluation(segmentId);

    const customer = await this.customersRepository.findOne({
      where: { id: dto.customerId },
      relations: {
        convertedLeads: {
          scores: true,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(
        `Customer with ID '${dto.customerId}' not found`,
      );
    }

    if (dto.assignmentType === SegmentAssignmentType.AI) {
      throw new BadRequestException(
        'AI segmentation is not configured for this backend',
      );
    }

    const evaluation = await this.evaluateRule(segment, customer);

    const existing = await this.customerSegmentsRepository.findOne({
      where: {
        customerId: customer.id,
        segmentId: segment.id,
      },
    });

    if (evaluation.matched) {
      const assignment = existing ?? this.customerSegmentsRepository.create();

      assignment.customerId = customer.id;
      assignment.segmentId = segment.id;
      assignment.assignmentType = SegmentAssignmentType.RULE;
      assignment.confidence = evaluation.confidence;
      assignment.assignedReason = evaluation.reason;
      assignment.assignedAt = new Date();
      assignment.assignedBy = segment.createdBy;

      const saved = await this.customerSegmentsRepository.save(assignment);

      return {
        customerId: customer.id,
        customerName: customer.name,
        segmentId: segment.id,
        segmentName: segment.name,
        assignmentType: saved.assignmentType,
        confidence: saved.confidence,
        assignmentReason: saved.assignedReason,
        assignedAt: saved.assignedAt,
        assignedBy: saved.assignedBy,
        status: 'COMPLETED',
        matched: true,
      };
    }

    if (existing) {
      await this.customerSegmentsRepository.remove(existing);
    }

    return {
      customerId: customer.id,
      customerName: customer.name,
      segmentId: segment.id,
      segmentName: segment.name,
      assignmentType: SegmentAssignmentType.RULE,
      confidence: evaluation.confidence,
      assignmentReason: evaluation.reason,
      assignedAt: new Date(),
      assignedBy: segment.createdBy,
      status: 'COMPLETED',
      matched: false,
    };
  }

  async evaluateAll(segmentId: string, dto: EvaluateSegmentBulkDto) {
    const segment = await this.getSegmentForEvaluation(segmentId);

    if (dto.assignmentType === SegmentAssignmentType.AI) {
      throw new BadRequestException(
        'AI segmentation is not configured for this backend',
      );
    }

    const customers = dto.customerIds?.length
      ? await this.customersRepository.find({
          where: dto.customerIds.map((id) => ({ id })),
          relations: {
            convertedLeads: {
              scores: true,
            },
          },
        })
      : await this.customersRepository.find({
          relations: {
            convertedLeads: {
              scores: true,
            },
          },
        });

    let matched = 0;

    for (const customer of customers) {
      const evaluation = await this.evaluateRule(segment, customer);

      const existing = await this.customerSegmentsRepository.findOne({
        where: {
          customerId: customer.id,
          segmentId: segment.id,
        },
      });

      if (evaluation.matched) {
        matched++;

        const assignment = existing ?? this.customerSegmentsRepository.create();

        assignment.customerId = customer.id;
        assignment.segmentId = segment.id;
        assignment.assignmentType = SegmentAssignmentType.RULE;
        assignment.confidence = evaluation.confidence;
        assignment.assignedReason = evaluation.reason;
        assignment.assignedAt = new Date();
        assignment.assignedBy = segment.createdBy;

        await this.customerSegmentsRepository.save(assignment);
      } else if (existing) {
        await this.customerSegmentsRepository.remove(existing);
      }
    }

    return {
      status: 'COMPLETED',
      total: customers.length,
      processed: customers.length,
      matched,
      message: `Evaluated ${customers.length} customer(s)`,
    };
  }

  /**
   * `creator` / `updater` are User relations; their password hash must never
   * leave the API.
   */
  private withoutUserHashes<
    T extends { creator?: User | null; updater?: User | null },
  >(segment: T): T {
    const strip = (user?: User | null) => {
      if (!user) return user;

      const { passwordHash, ...safeUser } = user;
      void passwordHash;

      return safeUser as User;
    };

    return {
      ...segment,
      creator: strip(segment.creator),
      updater: strip(segment.updater),
    };
  }

  private async ensureSegmentExists(id: string) {
    const segment = await this.segmentsRepository.findOne({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException(`Segment with ID '${id}' not found`);
    }

    return segment;
  }

  private async getSegmentForEvaluation(id: string) {
    const segment = await this.segmentsRepository.findOne({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException(`Segment with ID '${id}' not found`);
    }

    if (!segment.isActive) {
      throw new BadRequestException(`Segment '${segment.name}' is inactive`);
    }

    if (!segment.criteria) {
      throw new BadRequestException(
        `Segment '${segment.name}' has no criteria`,
      );
    }

    return segment;
  }

  private async evaluateRule(
    segment: Segment,
    customer: Customer,
  ): Promise<{
    matched: boolean;
    confidence: number;
    reason: string;
  }> {
    const criteria = segment.criteria as {
      logic?: 'AND' | 'OR';
      conditions?: Array<{
        id: string;
        field: string;
        operator: string;
        value: string;
      }>;
      minConfidence?: number | null;
    };

    const conditions = criteria.conditions ?? [];

    if (!conditions.length) {
      return {
        matched: false,
        confidence: 0,
        reason: 'Segment has no conditions',
      };
    }

    const results: boolean[] = [];
    const reasons: string[] = [];

    for (const condition of conditions) {
      const actualValue = await this.getCustomerFieldValue(
        customer,
        condition.field,
      );

      const matched = this.compareValue(
        actualValue,
        condition.operator,
        condition.value,
      );

      results.push(matched);

      reasons.push(
        `${condition.field} ${condition.operator} ${condition.value} => ${matched ? 'matched' : 'not matched'}`,
      );
    }

    const matched =
      criteria.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);

    return {
      matched,
      confidence: matched ? 1 : 0,
      reason: reasons.join('; '),
    };
  }

  private async getCustomerFieldValue(
    customer: Customer,
    field: string,
  ): Promise<string | number | null> {
    switch (field) {
      case 'industry':
        return customer.industry;

      case 'companySize':
        return customer.companySize;

      case 'companyName':
        return customer.companyName;

      case 'jobTitle':
        return customer.jobTitle;

      case 'status':
        return customer.status;

      case 'email':
        return customer.email;

      case 'score':
        return this.getLatestLeadScore(customer);

      default:
        return null;
    }
  }

  private async getLatestLeadScore(customer: Customer): Promise<number | null> {
    const convertedLeads = customer.convertedLeads ?? [];

    if (!convertedLeads.length) {
      return null;
    }

    const leadIds = convertedLeads.map((lead) => lead.id);

    const score = await this.leadScoresRepository
      .createQueryBuilder('score')
      .where('score.lead_id IN (:...leadIds)', { leadIds })
      .orderBy('score.created_at', 'DESC')
      .getOne();

    return score ? Number(score.score) : null;
  }

  private compareValue(
    actualValue: string | number | null,
    operator: string,
    expectedValue: string,
  ): boolean {
    if (actualValue === null || actualValue === undefined) {
      return false;
    }

    const actualString = String(actualValue);
    const expectedString = String(expectedValue);

    const actualNumber = Number(actualValue);
    const expectedNumber = Number(expectedValue);

    switch (operator) {
      case 'equals':
        return actualString.toLowerCase() === expectedString.toLowerCase();

      case 'not_equals':
        return actualString.toLowerCase() !== expectedString.toLowerCase();

      case 'contains':
        return actualString
          .toLowerCase()
          .includes(expectedString.toLowerCase());

      case 'greater_than':
        return (
          Number.isFinite(actualNumber) &&
          Number.isFinite(expectedNumber) &&
          actualNumber > expectedNumber
        );

      case 'greater_than_or_equal':
        return (
          Number.isFinite(actualNumber) &&
          Number.isFinite(expectedNumber) &&
          actualNumber >= expectedNumber
        );

      case 'less_than':
        return (
          Number.isFinite(actualNumber) &&
          Number.isFinite(expectedNumber) &&
          actualNumber < expectedNumber
        );

      case 'less_than_or_equal':
        return (
          Number.isFinite(actualNumber) &&
          Number.isFinite(expectedNumber) &&
          actualNumber <= expectedNumber
        );

      default:
        return false;
    }
  }
}
