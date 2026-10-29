import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { QueryCustomerDto } from './dto/index.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { CustomerMapper } from './mappers/customer.mapper.js';

export type SupportedChurnRiskLevel =
  'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_DATA';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,

    @InjectRepository(CustomerSegment)
    private readonly customerSegmentsRepository: Repository<CustomerSegment>,

    @InjectRepository(Segment)
    private readonly segmentsRepository: Repository<Segment>,

    @InjectRepository(CustomerChurnAssessment)
    private readonly churnAssessmentsRepository?: Repository<CustomerChurnAssessment>,

    @InjectRepository(CustomerTask)
    private readonly customerTasksRepository?: Repository<CustomerTask>,
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

  classifyChurnScore(score: number | null): SupportedChurnRiskLevel {
    if (score === null || score === undefined) {
      return 'INSUFFICIENT_DATA';
    }

    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new BadRequestException('Churn score must be a finite number');
    }

    if (score < 0 || score > 100) {
      throw new BadRequestException(
        'Churn score must be in the range 0 to 100',
      );
    }

    if (score <= 39) {
      return 'LOW';
    }

    if (score <= 69) {
      return 'MEDIUM';
    }

    return 'HIGH';
  }

  async createChurnAssessment(
    customerId: string,
    input: {
      score: number | null;
      riskLevel?: string;
      evidence?: Array<Record<string, unknown>>;
      coverage?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      asOfDate?: string;
      workflowRunId?: string | null;
      policyVersion?: string;
    },
  ): Promise<CustomerChurnAssessment> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    const score = input.score;
    const derivedRisk = this.classifyChurnScore(score);

    if (input.riskLevel && input.riskLevel.toUpperCase() !== derivedRisk) {
      throw new BadRequestException(
        `Risk level ${input.riskLevel} does not match score ${score}`,
      );
    }

    if (!this.churnAssessmentsRepository) {
      throw new BadRequestException(
        'Churn assessment repository is not configured',
      );
    }

    const assessment = this.churnAssessmentsRepository.create({
      customerId,
      score: score ?? null,
      riskLevel: derivedRisk,
      asOfDate: input.asOfDate ?? new Date().toISOString().slice(0, 10),
      policyVersion: input.policyVersion ?? 'v1',
      evidence: input.evidence ?? [],
      coverage: input.coverage ?? {
        totalSignals: Array.isArray(input.evidence) ? input.evidence.length : 0,
        availableSignals: Array.isArray(input.evidence)
          ? input.evidence.length
          : 0,
        coveragePercent:
          Array.isArray(input.evidence) && input.evidence.length > 0 ? 100 : 0,
      },
      workflowRunId: input.workflowRunId ?? null,
      metadata: input.metadata ?? {},
    });

    try {
      return await this.churnAssessmentsRepository.save(assessment);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate')) {
        return (
          (await this.churnAssessmentsRepository.findOne({
            where: {
              customerId,
              asOfDate: input.asOfDate ?? new Date().toISOString().slice(0, 10),
            },
          })) ?? assessment
        );
      }
      throw error;
    }
  }

  async findChurnAssessments(
    customerId: string,
  ): Promise<CustomerChurnAssessment[]> {
    if (!this.churnAssessmentsRepository) {
      return [];
    }

    return this.churnAssessmentsRepository.find({
      where: { customerId },
      order: { assessedAt: 'DESC' },
    });
  }

  async ensureRetentionTask(params: {
    customerId: string;
    assessmentId?: string | null;
    riskLevel: string;
    score: number | null;
    evidence?: Array<Record<string, unknown>>;
    idempotencyKey?: string;
  }): Promise<CustomerTask | null> {
    if (!this.customerTasksRepository) {
      return null;
    }

    const riskLevel = params.riskLevel?.toUpperCase();
    const evidence = Array.isArray(params.evidence) ? params.evidence : [];

    if (riskLevel !== 'HIGH' || !params.assessmentId) {
      return null;
    }

    if (evidence.length === 0) {
      return null;
    }

    const key =
      params.idempotencyKey ??
      `customer:${params.customerId}:assessment:${params.assessmentId}:RETENTION`;

    const existing = await this.customerTasksRepository.findOne({
      where: { idempotencyKey: key },
    });

    if (existing) {
      return existing;
    }

    const task = this.customerTasksRepository.create({
      customerId: params.customerId,
      assessmentId: params.assessmentId,
      taskType: 'RETENTION',
      status: 'OPEN',
      priority: 'HIGH',
      idempotencyKey: key,
      notes: `Retention follow-up for assessment ${params.assessmentId}`,
      metadata: {
        score: params.score,
        riskLevel,
        evidenceCount: evidence.length,
      },
    });

    try {
      return await this.customerTasksRepository.save(task);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate')) {
        return (
          (await this.customerTasksRepository.findOne({
            where: { idempotencyKey: key },
          })) ?? task
        );
      }
      throw error;
    }
  }

  async findCustomerTasks(): Promise<CustomerTask[]> {
    if (!this.customerTasksRepository) {
      return [];
    }

    return this.customerTasksRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createCustomerTask(input: {
    customerId: string;
    assessmentId?: string | null;
    taskType?: string;
    priority?: string;
    notes?: string;
    idempotencyKey?: string;
    dueAt?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<CustomerTask | null> {
    if (!this.customerTasksRepository) {
      return null;
    }

    const customer = await this.customersRepository.findOne({
      where: { id: input.customerId },
    });

    if (!customer) {
      throw new NotFoundException(
        `Customer with ID '${input.customerId}' not found`,
      );
    }

    const finalTaskType = (input.taskType ?? 'RETENTION').toUpperCase();
    if (finalTaskType !== 'RETENTION') {
      throw new BadRequestException(
        'Only retention tasks are supported by this API',
      );
    }

    const key =
      input.idempotencyKey ??
      `customer:${input.customerId}:assessment:${input.assessmentId ?? 'none'}:RETENTION`;

    const existing = await this.customerTasksRepository.findOne({
      where: { idempotencyKey: key },
    });

    if (existing) {
      return existing;
    }

    const task = this.customerTasksRepository.create({
      customerId: input.customerId,
      assessmentId: input.assessmentId ?? null,
      taskType: finalTaskType,
      status: 'OPEN',
      priority: input.priority ?? 'HIGH',
      idempotencyKey: key,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    });

    try {
      return await this.customerTasksRepository.save(task);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate')) {
        return (
          (await this.customerTasksRepository.findOne({
            where: { idempotencyKey: key },
          })) ?? task
        );
      }
      throw error;
    }
  }
}
