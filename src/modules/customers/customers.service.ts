import {
  BadRequestException,
  ConflictException,
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
import { QueryCustomerTaskDto } from './dto/query-customer-task.dto.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { CustomerMapper } from './mappers/customer.mapper.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import {
  hasSamePayload,
  isPostgresUniqueViolation,
} from '../../common/utils/idempotency.util.js';

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
    actor: AuthenticatedUser,
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
    if (actor.role === UserRole.SALES) {
      qb.andWhere('customer.createdBy = :actorId', { actorId: actor.id });
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

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<CustomerResponseDto> {
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

    if (
      !customer ||
      (actor.role === UserRole.SALES && customer.createdBy !== actor.id)
    ) {
      throw new NotFoundException(`Customer with ID '${id}' not found`);
    }

    return CustomerMapper.toResponseDto(
      Object.assign(customer, {
        segmentCount: customer.customerSegments?.length ?? 0,
      }),
    );
  }

  private async assertCustomerAccess(
    customerId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
      select: { id: true, createdBy: true },
    });
    if (
      !customer ||
      (actor.role === UserRole.SALES && customer.createdBy !== actor.id)
    ) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }
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

    const evidence = Array.isArray(input.evidence)
      ? input.evidence.filter(
          (item) =>
            item !== null && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
    const hasEvidence = evidence.some(
      (item) =>
        typeof item.source === 'string' &&
        typeof item.signal === 'string' &&
        item.value !== null &&
        item.value !== undefined,
    );
    const score = hasEvidence ? input.score : null;
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

    const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
    const assessment = this.churnAssessmentsRepository.create({
      customerId,
      score: score ?? null,
      riskLevel: derivedRisk,
      asOfDate,
      policyVersion: input.policyVersion ?? 'v1',
      evidence,
      coverage: input.coverage ?? { availableSignals: evidence.length },
      workflowRunId: input.workflowRunId ?? null,
      metadata: input.metadata ?? {},
    });

    try {
      return await this.churnAssessmentsRepository.save(assessment);
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        return (
          (await this.churnAssessmentsRepository.findOne({
            where: { customerId, asOfDate },
          })) ?? assessment
        );
      }
      throw error;
    }
  }

  async findChurnAssessments(
    customerId: string,
    actor?: AuthenticatedUser,
  ): Promise<CustomerChurnAssessment[]> {
    if (actor) {
      await this.assertCustomerAccess(customerId, actor);
    }
    if (!this.churnAssessmentsRepository) {
      return [];
    }

    return this.churnAssessmentsRepository.find({
      where: { customerId },
      order: { assessedAt: 'DESC' },
    });
  }

  async findChurnCustomerCohort(
    page = 1,
    limit = 25,
  ): Promise<{
    data: Array<Pick<Customer, 'id' | 'name' | 'companyName' | 'status'>>;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const [data, total] = await this.customersRepository.findAndCount({
      select: {
        id: true,
        name: true,
        companyName: true,
        status: true,
      },
      order: { updatedAt: 'DESC' },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
    });

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getChurnContext(customerId: string) {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
      relations: {
        convertedLeads: {
          interactions: true,
          enrollments: { executions: true },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    const leads = customer.convertedLeads ?? [];
    const interactions = leads
      .flatMap((lead) => lead.interactions ?? [])
      .sort(
        (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
      );
    const executions = leads.flatMap((lead) =>
      (lead.enrollments ?? []).flatMap(
        (enrollment) => enrollment.executions ?? [],
      ),
    );
    const failedFollowUps = executions.filter((execution) =>
      ['FAILED', 'RETRYING'].includes(execution.status),
    ).length;
    const evidence: Array<Record<string, unknown>> = [];
    if (interactions.length > 0) {
      evidence.push({
        source: 'interactions',
        signal: 'recorded_interaction_count',
        value: interactions.length,
        observedAt: interactions[0].occurredAt.toISOString(),
      });
    }
    if (executions.length > 0) {
      evidence.push({
        source: 'follow_up_executions',
        signal: 'failed_or_retrying_execution_count',
        value: failedFollowUps,
      });
    }

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        companyName: customer.companyName,
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      evidence,
      signals: {
        interactionCount: interactions.length,
        latestInteractionAt: interactions[0]?.occurredAt ?? null,
        followUpExecutionCount: executions.length,
        failedOrRetryingFollowUpCount: failedFollowUps,
      },
      coverage: {
        customerProfile: 'AVAILABLE',
        interactions: interactions.length > 0 ? 'AVAILABLE' : 'NO_RECORDS',
        followUps: executions.length > 0 ? 'AVAILABLE' : 'NO_RECORDS',
        feedback: 'NOT_CONNECTED',
        issues: 'NOT_CONNECTED',
        renewals: 'NOT_CONNECTED',
      },
    };
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

  async findCustomerTasks(
    query: QueryCustomerTaskDto = {},
  ): Promise<CustomerTask[]> {
    if (!this.customerTasksRepository) {
      return [];
    }

    return this.customerTasksRepository.find({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.taskType ? { taskType: query.taskType } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      order: { createdAt: 'DESC' },
      take: query.limit ?? 20,
      skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
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

    const priority = (input.priority ?? 'HIGH').toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
      throw new BadRequestException('Unsupported customer task priority');
    }
    const assessmentId = input.assessmentId ?? null;
    if (assessmentId) {
      const assessment = await this.churnAssessmentsRepository?.findOne({
        where: { id: assessmentId, customerId: input.customerId },
      });
      if (!assessment) {
        throw new NotFoundException(
          `Churn assessment '${assessmentId}' not found for customer '${input.customerId}'`,
        );
      }
    }

    const providedKey = input.idempotencyKey?.trim();
    if (input.idempotencyKey !== undefined && !providedKey) {
      throw new BadRequestException('Idempotency key cannot be empty');
    }
    if (providedKey && providedKey.length > 255) {
      throw new BadRequestException(
        'Idempotency key must be at most 255 characters',
      );
    }
    const key =
      providedKey ??
      `customer:${input.customerId}:assessment:${input.assessmentId ?? 'none'}:RETENTION`;

    const existing = await this.customerTasksRepository.findOne({
      where: { idempotencyKey: key },
    });

    if (existing) {
      if (
        existing.customerId !== input.customerId ||
        existing.assessmentId !== assessmentId ||
        existing.taskType !== finalTaskType ||
        existing.priority !== priority ||
        existing.notes !== (input.notes ?? null) ||
        !hasSamePayload(existing.metadata ?? {}, input.metadata ?? {})
      ) {
        throw new ConflictException(
          'Idempotency key was already used with a different customer task',
        );
      }
      return existing;
    }

    const task = this.customerTasksRepository.create({
      customerId: input.customerId,
      assessmentId: input.assessmentId ?? null,
      taskType: finalTaskType,
      status: 'OPEN',
      priority,
      idempotencyKey: key,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    });

    try {
      return await this.customerTasksRepository.save(task);
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        const concurrent = await this.customerTasksRepository.findOne({
          where: { idempotencyKey: key },
        });
        if (!concurrent) {
          throw error;
        }
        if (
          concurrent.customerId !== input.customerId ||
          concurrent.assessmentId !== assessmentId ||
          concurrent.taskType !== finalTaskType ||
          concurrent.priority !== priority ||
          concurrent.notes !== (input.notes ?? null) ||
          !hasSamePayload(concurrent.metadata ?? {}, input.metadata ?? {})
        ) {
          throw new ConflictException(
            'Idempotency key was already used with a different customer task',
          );
        }
        return concurrent;
      }
      throw error;
    }
  }
}
