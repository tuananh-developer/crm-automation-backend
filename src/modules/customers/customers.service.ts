import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Customer } from './entities/customer.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { LeadQualification } from '../lead-intelligence/entities/lead-qualification.entity.js';
import { LeadEnrichment } from '../lead-intelligence/entities/lead-enrichment.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import {
  hasSamePayload,
  isPostgresUniqueViolation,
} from '../../common/utils/idempotency.util.js';
import {
  Customer360AiSummaryDto,
  Customer360CallbackDto,
  Customer360CallbackResponseDto,
  Customer360ResponseDto,
  Customer360Status,
  CustomerResponseDto,
  QueryCustomerDto,
  TriggerCustomer360ResponseDto,
} from './dto/index.js';
import { QueryCustomerTaskDto } from './dto/query-customer-task.dto.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { CustomerMapper } from './mappers/customer.mapper.js';
import { N8nWorkflowDispatchService } from '../t12-workflows/n8n-workflow-dispatch.service.js';
import { WorkflowExecutionClaimsService } from '../t12-workflows/workflow-execution-claims.service.js';
import { CustomerFeedback } from '../feedback/entities/customer-feedback.entity.js';
import type { ClaimCustomer360ProfileDto } from './dto/claim-customer-360-profile.dto.js';

export type SupportedChurnRiskLevel =
  'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_DATA';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,

    @InjectRepository(CustomerSegment)
    private readonly customerSegmentsRepository: Repository<CustomerSegment>,

    @InjectRepository(Segment)
    private readonly segmentsRepository: Repository<Segment>,

    @Optional()
    @InjectRepository(CustomerChurnAssessment)
    private readonly churnAssessmentsRepository?: Repository<CustomerChurnAssessment>,

    @Optional()
    @InjectRepository(CustomerTask)
    private readonly customerTasksRepository?: Repository<CustomerTask>,

    @Optional()
    @InjectRepository(WorkflowRun)
    private readonly workflowRunsRepository?: Repository<WorkflowRun>,

    @Optional()
    @InjectRepository(Lead)
    private readonly leadsRepository?: Repository<Lead>,

    @Optional()
    @InjectRepository(Interaction)
    private readonly interactionsRepository?: Repository<Interaction>,

    @Optional()
    @InjectRepository(LeadQualification)
    private readonly qualificationsRepository?: Repository<LeadQualification>,

    @Optional()
    @InjectRepository(LeadEnrichment)
    private readonly enrichmentsRepository?: Repository<LeadEnrichment>,

    @Optional()
    @InjectRepository(LeadScore)
    private readonly scoresRepository?: Repository<LeadScore>,

    @Optional()
    @InjectRepository(LeadFollowUpEnrollment)
    private readonly enrollmentsRepository?: Repository<LeadFollowUpEnrollment>,

    @Optional()
    @InjectRepository(FollowUpExecution)
    private readonly executionsRepository?: Repository<FollowUpExecution>,

    @Optional()
    private readonly configService?: ConfigService,

    @Optional()
    private readonly dataSource?: DataSource,

    @Optional()
    private readonly dispatcher?: N8nWorkflowDispatchService,

    @Optional()
    private readonly executionClaims?: WorkflowExecutionClaimsService,

    @Optional()
    @InjectRepository(CustomerFeedback)
    private readonly feedbackRepository?: Repository<CustomerFeedback>,
  ) {}

  async findAll(
    query: QueryCustomerDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<CustomerResponseDto>> {
    return this.queryCustomers(query, actor);
  }

  async findAllInternal(
    query: QueryCustomerDto,
  ): Promise<PaginatedResponseDto<CustomerResponseDto>> {
    return this.queryCustomers(query);
  }

  private async queryCustomers(
    query: QueryCustomerDto,
    actor?: AuthenticatedUser,
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
    if (query.isStrategic !== undefined) {
      qb.andWhere('customer.isStrategic = :isStrategic', {
        isStrategic: query.isStrategic,
      });
    }
    if (actor?.role === UserRole.SALES) {
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
    actor?: AuthenticatedUser,
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
      (actor &&
        actor.role === UserRole.SALES &&
        customer.createdBy !== actor.id)
    ) {
      throw new NotFoundException(`Customer with ID '${id}' not found`);
    }

    return CustomerMapper.toResponseDto(
      Object.assign(customer, {
        segmentCount: customer.customerSegments?.length ?? 0,
      }),
    );
  }

  async findOneInternal(id: string): Promise<CustomerResponseDto> {
    return this.findOne(id);
  }

  /**
   * Atomically claims a Customer 360 WorkflowRun and returns the customer CRM profile (T12-WF05).
   * Prevents duplicate/replayed n8n executions from reading downstream sources or calling Gemini.
   */
  async claimAndGetCustomerProfile(
    customerId: string,
    dto: ClaimCustomer360ProfileDto,
  ): Promise<CustomerResponseDto> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
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
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    if (!this.workflowRunsRepository) {
      throw new InternalServerErrorException(
        'WorkflowRun repository is not configured',
      );
    }

    const run = await this.workflowRunsRepository.findOne({
      where: {
        id: dto.workflowRunId,
        customerId,
        workflowName: 't12-wf05-customer-360',
      },
    });
    if (!run) {
      throw new NotFoundException(
        `WorkflowRun '${dto.workflowRunId}' not found for Customer '${customerId}'`,
      );
    }

    const claimsService =
      this.executionClaims ??
      (this.dataSource
        ? new WorkflowExecutionClaimsService(this.dataSource)
        : null);
    if (!claimsService) {
      throw new InternalServerErrorException(
        'WorkflowExecutionClaimsService is unavailable',
      );
    }

    const claim = await claimsService.claim({
      workflowRunId: dto.workflowRunId,
      workflowName: 't12-wf05-customer-360',
      n8nExecutionId: dto.n8nExecutionId,
    });
    if (!claim.claimed) {
      throw new ConflictException(
        `WorkflowRun '${dto.workflowRunId}' is already claimed by another execution or is no longer active`,
      );
    }

    return CustomerMapper.toResponseDto(
      Object.assign(customer, {
        segmentCount: customer.customerSegments?.length ?? 0,
      }),
    );
  }

  /**
   * Enforces object-level customer access policy (RBAC + Ownership).
   * Admins have full access. Sales agents can only access customers they created or
   * customers converted from leads they own or converted.
   */
  private checkCustomerAccess(
    customer: Customer,
    user?: AuthenticatedUser,
  ): void {
    if (!user) {
      return; // Internal service execution (e.g. n8n service worker)
    }

    if (user.role === UserRole.ADMIN) {
      return; // ADMIN role bypasses ownership checks
    }

    const isCreator = customer.createdBy === user.id;
    const isOwnerOrConverter =
      customer.convertedLeads &&
      customer.convertedLeads.some(
        (lead) => lead.ownerId === user.id || lead.convertedBy === user.id,
      );

    if (!isCreator && !isOwnerOrConverter) {
      throw new ForbiddenException(
        `Forbidden: User '${user.id}' is not authorized to access Customer '${customer.id}' (requires ownership or ADMIN role).`,
      );
    }
  }

  /**
   * Aggregates full CRM 360 view for a customer (T12-WF05 / UC05 / 07_API_CONTRACT.md).
   * Combines profile, converted leads, interaction timeline, intelligence history,
   * follow-up sequences, segment memberships, and AI 360 executive summary.
   */
  async getCustomer360(
    customerId: string,
    user?: AuthenticatedUser,
  ): Promise<Customer360ResponseDto> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
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
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    this.checkCustomerAccess(customer, user);

    const convertedLeads = customer.convertedLeads || [];
    const convertedLeadIds = convertedLeads.map((l) => l.id);

    let interactions: Interaction[] = [];
    let qualifications: LeadQualification[] = [];
    let enrichments: LeadEnrichment[] = [];
    let scores: LeadScore[] = [];
    let enrollments: LeadFollowUpEnrollment[] = [];
    let executions: FollowUpExecution[] = [];

    if (convertedLeadIds.length > 0) {
      interactions =
        (await this.interactionsRepository?.find({
          where: { leadId: In(convertedLeadIds) },
          order: { occurredAt: 'DESC' },
        })) ?? [];

      qualifications =
        (await this.qualificationsRepository?.find({
          where: { leadId: In(convertedLeadIds) },
          order: { createdAt: 'DESC' },
        })) ?? [];

      enrichments =
        (await this.enrichmentsRepository?.find({
          where: { leadId: In(convertedLeadIds) },
          order: { enrichedAt: 'DESC' },
        })) ?? [];

      scores =
        (await this.scoresRepository?.find({
          where: { leadId: In(convertedLeadIds) },
          order: { createdAt: 'DESC' },
        })) ?? [];

      enrollments =
        (await this.enrollmentsRepository?.find({
          where: { leadId: In(convertedLeadIds) },
          order: { createdAt: 'DESC' },
          relations: { sequence: true },
        })) ?? [];

      const enrollmentIds = enrollments.map((e) => e.id);
      if (enrollmentIds.length > 0) {
        executions =
          (await this.executionsRepository?.find({
            where: { enrollmentId: In(enrollmentIds) },
            order: { scheduledAt: 'DESC' },
            relations: { step: true },
          })) ?? [];
      }
    }

    // Fetch latest completed WorkflowRun for Customer 360
    const latestRun = this.workflowRunsRepository
      ? await this.workflowRunsRepository.findOne({
          where: {
            customerId,
            workflowName: 't12-wf05-customer-360',
          },
          order: { startedAt: 'DESC' },
        })
      : null;

    let aiSummary: Customer360AiSummaryDto | null = null;
    if (
      latestRun &&
      latestRun.status === WorkflowStatus.SUCCESS &&
      latestRun.outputPayload
    ) {
      const p = latestRun.outputPayload as Record<string, unknown>;
      const rawSummary = typeof p.summary === 'string' ? p.summary.trim() : '';
      if (rawSummary.length > 0) {
        const modelInfo = p.modelInfo as Record<string, unknown> | undefined;
        aiSummary = {
          summary: rawSummary,
          keyStrengths: Array.isArray(p.keyStrengths)
            ? (p.keyStrengths as string[])
            : [],
          potentialRisks: Array.isArray(p.potentialRisks)
            ? (p.potentialRisks as string[])
            : [],
          growthOpportunities: Array.isArray(p.growthOpportunities)
            ? (p.growthOpportunities as string[])
            : [],
          recommendedNextAction:
            typeof p.recommendedNextAction === 'string'
              ? p.recommendedNextAction
              : 'Maintain proactive quarterly engagement.',
          aiModel:
            typeof modelInfo?.model === 'string'
              ? modelInfo.model
              : 'gemini-3.5-flash-lite',
          evaluatedAt:
            typeof p.evaluatedAt === 'string'
              ? p.evaluatedAt
              : latestRun.finishedAt?.toISOString(),
        };
      }
    }

    const customerDto = CustomerMapper.toResponseDto(
      Object.assign(customer, {
        segmentCount: customer.customerSegments?.length ?? 0,
      }),
    );

    const feedbackCoverage = this.feedbackRepository
      ? (await this.feedbackRepository.count({ where: { customerId } })) > 0
        ? 'AVAILABLE'
        : 'EMPTY'
      : 'NOT_CONNECTED';

    return {
      customer: customerDto,
      convertedLeads: convertedLeads.map((l) => ({
        id: l.id,
        firstName: l.firstName,
        lastName: l.lastName,
        email: l.email,
        phone: l.phone,
        companyName: l.companyName,
        jobTitle: l.jobTitle,
        convertedAt: l.convertedAt,
      })),
      interactions: interactions.map((i) => ({
        id: i.id,
        leadId: i.leadId,
        type: i.type,
        channel: i.channel,
        subject: i.subject,
        content: i.content,
        occurredAt: i.occurredAt,
      })),
      intelligence: {
        qualifications: qualifications.map((q) => ({
          id: q.id,
          leadId: q.leadId,
          status: q.status,
          confidence: q.confidence,
          intent: q.intent,
          reason: q.reason,
          evaluatedAt: q.createdAt,
        })),
        enrichments: enrichments.map((e) => ({
          id: e.id,
          leadId: e.leadId,
          provider: e.provider,
          companyName: e.companyName,
          companyIndustry: e.companyIndustry,
          companySize: e.companySize,
          status: e.status,
          enrichedAt: e.enrichedAt,
        })),
        scores: scores.map((s) => ({
          id: s.id,
          leadId: s.leadId,
          score: s.score,
          label: s.label,
          reason: s.reason,
          modelName: s.modelName,
          createdAt: s.createdAt,
        })),
      },
      followUps: {
        enrollments: enrollments.map((en) => ({
          id: en.id,
          sequenceId: en.sequenceId,
          sequenceName: en.sequence?.name ?? null,
          status: en.status,
          enrolledAt: en.startedAt || en.createdAt,
        })),
        executions: executions.map((ex) => ({
          id: ex.id,
          enrollmentId: ex.enrollmentId,
          stepOrder: ex.step?.stepOrder ?? null,
          status: ex.status,
          scheduledAt: ex.scheduledAt,
          executedAt: ex.completedAt || ex.startedAt || null,
        })),
      },
      segments: (customer.customerSegments || []).map((cs) => ({
        segmentId: cs.segmentId,
        segmentName: cs.segment?.name ?? null,
        assignmentType: cs.assignmentType,
        confidence: cs.confidence,
        assignedReason: cs.assignedReason,
        assignedAt: cs.assignedAt,
      })),
      sourceCoverage: {
        crmProfile: 'AVAILABLE',
        interactions: interactions.length > 0 ? 'AVAILABLE' : 'EMPTY',
        leadIntelligence:
          qualifications.length > 0 ||
          enrichments.length > 0 ||
          scores.length > 0
            ? 'AVAILABLE'
            : 'EMPTY',
        followUps:
          enrollments.length > 0 || executions.length > 0
            ? 'AVAILABLE'
            : 'EMPTY',
        segments:
          (customer.customerSegments || []).length > 0 ? 'AVAILABLE' : 'EMPTY',
        customerIssues: 'NOT_CONNECTED',
        customerFeedback: feedbackCoverage,
      },
      aiSummary,
      latestWorkflowRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.finishedAt,
            errorMessage: latestRun.errorMessage ?? null,
          }
        : null,
    };
  }

  /**
   * Retrieves interactions for a customer and its converted leads (for n8n Node 4).
   */
  async getCustomerInteractions(
    customerId: string,
    user?: AuthenticatedUser,
  ): Promise<any[]> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
      relations: { convertedLeads: true },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }
    this.checkCustomerAccess(customer, user);

    const leadIds = (customer.convertedLeads || []).map((l) => l.id);
    if (leadIds.length === 0) {
      return [];
    }
    return (
      (await this.interactionsRepository?.find({
        where: { leadId: In(leadIds) },
        order: { occurredAt: 'DESC' },
      })) ?? []
    );
  }

  /**
   * Retrieves lead intelligence history (for n8n Node 5).
   */
  async getCustomerIntelligence(
    customerId: string,
    user?: AuthenticatedUser,
  ): Promise<{ qualifications: any[]; enrichments: any[]; scores: any[] }> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
      relations: { convertedLeads: true },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }
    this.checkCustomerAccess(customer, user);

    const leadIds = (customer.convertedLeads || []).map((l) => l.id);
    if (leadIds.length === 0) {
      return { qualifications: [], enrichments: [], scores: [] };
    }

    const [qualifications, enrichments, scores] = await Promise.all([
      this.qualificationsRepository?.find({
        where: { leadId: In(leadIds) },
        order: { createdAt: 'DESC' },
      }) ?? Promise.resolve([]),
      this.enrichmentsRepository?.find({
        where: { leadId: In(leadIds) },
        order: { enrichedAt: 'DESC' },
      }) ?? Promise.resolve([]),
      this.scoresRepository?.find({
        where: { leadId: In(leadIds) },
        order: { createdAt: 'DESC' },
      }) ?? Promise.resolve([]),
    ]);

    return { qualifications, enrichments, scores };
  }

  /**
   * Retrieves follow-up campaign history (for n8n Node 6).
   */
  async getCustomerFollowUps(
    customerId: string,
    user?: AuthenticatedUser,
  ): Promise<{ enrollments: any[]; executions: any[] }> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
      relations: { convertedLeads: true },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }
    this.checkCustomerAccess(customer, user);

    const leadIds = (customer.convertedLeads || []).map((l) => l.id);
    if (leadIds.length === 0) {
      return { enrollments: [], executions: [] };
    }

    const enrollments =
      (await this.enrollmentsRepository?.find({
        where: { leadId: In(leadIds) },
        order: { createdAt: 'DESC' },
        relations: { sequence: true },
      })) ?? [];

    const enrollmentIds = enrollments.map((e) => e.id);
    let executions: FollowUpExecution[] = [];
    if (enrollmentIds.length > 0) {
      executions =
        (await this.executionsRepository?.find({
          where: { enrollmentId: In(enrollmentIds) },
          order: { scheduledAt: 'DESC' },
          relations: { step: true },
        })) ?? [];
    }

    return { enrollments, executions };
  }

  /**
   * Retrieves segment memberships for a customer (for n8n Node 7).
   * When called internally with workflowRunId and n8nExecutionId, renews the WF05 execution claim lease.
   */
  async getCustomerSegments(
    customerId: string,
    user?: AuthenticatedUser,
    workflowRunId?: string,
    n8nExecutionId?: string,
  ): Promise<any[]> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
      relations: {
        convertedLeads: true,
        customerSegments: { segment: true },
      },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }
    this.checkCustomerAccess(customer, user);

    if (!user && workflowRunId && n8nExecutionId) {
      if (!this.workflowRunsRepository) {
        throw new InternalServerErrorException(
          'WorkflowRun repository is not configured',
        );
      }

      const run = await this.workflowRunsRepository.findOne({
        where: {
          id: workflowRunId,
          customerId,
          workflowName: 't12-wf05-customer-360',
        },
      });
      if (!run) {
        throw new NotFoundException(
          `WorkflowRun '${workflowRunId}' not found for Customer '${customerId}'`,
        );
      }
      const claimsService =
        this.executionClaims ??
        (this.dataSource
          ? new WorkflowExecutionClaimsService(this.dataSource)
          : null);
      if (claimsService) {
        await claimsService.heartbeat({
          workflowRunId,
          workflowName: 't12-wf05-customer-360',
          n8nExecutionId,
        });
      }
    }

    return (customer.customerSegments || []).map((cs) => ({
      segmentId: cs.segmentId,
      segmentName: cs.segment?.name ?? null,
      assignmentType: cs.assignmentType,
      confidence: cs.confidence,
      assignedReason: cs.assignedReason,
      assignedAt: cs.assignedAt,
    }));
  }

  /**
   * Initiates AI Customer 360 analysis workflow (T12-WF05).
   * Creates a correlated WorkflowRun and dispatches an authenticated internal webhook to n8n.
   * Enforces object-level authorization and binds triggeredByUserId to authenticated caller.
   */
  async triggerCustomer360(
    customerId: string,
    user: AuthenticatedUser,
    clientProvidedKey?: string,
  ): Promise<TriggerCustomer360ResponseDto> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
      relations: { convertedLeads: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    this.checkCustomerAccess(customer, user);

    const n8nApiKey =
      this.configService?.get<string>('N8N_API_KEY') ||
      this.configService?.get<string>('N8N_WEBHOOK_SECRET');

    if (!n8nApiKey) {
      throw new InternalServerErrorException(
        'Webhook authentication secret (N8N_API_KEY / N8N_WEBHOOK_SECRET) is not configured',
      );
    }

    // 1. Transactional Outbox: persist WorkflowRun and durable OutboxEvent atomically
    const dispatcher = this.dispatcher ?? new N8nWorkflowDispatchService();
    const trimmedKey =
      typeof clientProvidedKey === 'string' ? clientProvidedKey.trim() : '';
    if (!trimmedKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required and cannot be empty',
      );
    }
    if (trimmedKey.length > 120) {
      throw new BadRequestException(
        'Idempotency-Key header must be at most 120 characters',
      );
    }
    const idempotencyKey = `wf05:${user.id}:${customer.id}:${trimmedKey}`;

    let savedRun: WorkflowRun;
    if (this.dataSource) {
      try {
        savedRun = await this.dataSource.transaction(async (manager) => {
          const workflowRunsRepo = manager.getRepository(WorkflowRun);

          // Lookup-and-return pattern: if key exists, return existing run
          const existingRun = await workflowRunsRepo.findOne({
            where: { idempotencyKey },
          });

          if (existingRun) {
            if (existingRun.workflowName !== 't12-wf05-customer-360') {
              throw new ConflictException(
                `Idempotency key is already used by another workflow: ${existingRun.workflowName}`,
              );
            }
            this.logger.log(
              `Replaying existing WorkflowRun ${existingRun.id} for idempotencyKey=${idempotencyKey}`,
            );
            return existingRun;
          }

          const workflowRun = workflowRunsRepo.create({
            workflowName: 't12-wf05-customer-360',
            customerId: customer.id,
            triggeredByUserId: user.id,
            status: WorkflowStatus.PENDING,
            startedAt: new Date(),
            idempotencyKey,
            inputPayload: {
              customerId: customer.id,
              customerName: customer.name,
              customerEmail: customer.email,
              companyName: customer.companyName,
              triggeredByUserId: user.id,
              requestedAt: new Date().toISOString(),
            },
          });

          const run = await workflowRunsRepo.save(workflowRun);

          // Atomically enqueue durable HTTP outbox event in the same transaction
          await dispatcher.enqueue(
            manager,
            'N8N_WF05_WEBHOOK_URL',
            't12-wf05-customer-360',
            {
              customerId: customer.id,
              workflowRunId: run.id,
              triggeredByUserId: user.id,
              timestamp: new Date().toISOString(),
            },
          );

          return run;
        });
      } catch (error) {
        if (!isPostgresUniqueViolation(error) || !this.workflowRunsRepository) {
          throw error;
        }
        // Lookup outside the rolled-back transaction to avoid PostgreSQL 25P02
        const concurrentRun = await this.workflowRunsRepository.findOne({
          where: { idempotencyKey },
        });
        if (!concurrentRun) {
          throw error;
        }
        if (concurrentRun.workflowName !== 't12-wf05-customer-360') {
          throw new ConflictException(
            `Idempotency key is already used by another workflow: ${concurrentRun.workflowName}`,
          );
        }
        savedRun = concurrentRun;
      }
    } else {
      if (!this.workflowRunsRepository) {
        throw new InternalServerErrorException(
          'WorkflowRun repository is not configured',
        );
      }
      const existingRun = await this.workflowRunsRepository.findOne({
        where: { idempotencyKey },
      });
      if (existingRun) {
        if (existingRun.workflowName !== 't12-wf05-customer-360') {
          throw new ConflictException(
            `Idempotency key is already used by another workflow: ${existingRun.workflowName}`,
          );
        }
        savedRun = existingRun;
      } else {
        const workflowRun = this.workflowRunsRepository.create({
          workflowName: 't12-wf05-customer-360',
          customerId: customer.id,
          triggeredByUserId: user.id,
          status: WorkflowStatus.PENDING,
          startedAt: new Date(),
          idempotencyKey,
          inputPayload: {
            customerId: customer.id,
            customerName: customer.name,
            customerEmail: customer.email,
            companyName: customer.companyName,
            triggeredByUserId: user.id,
            requestedAt: new Date().toISOString(),
          },
        });
        savedRun = await this.workflowRunsRepository.save(workflowRun);
      }
    }

    this.logger.log(
      `Created WorkflowRun ${savedRun.id} and enqueued OutboxEvent for Customer 360 of customer ${customer.id} by user ${user.id}`,
    );

    return {
      message: 'Customer 360 analysis workflow triggered successfully',
      customerId: customer.id,
      workflowRunId: savedRun.id,
    };
  }

  /**
   * Receives AI Customer 360 callback from n8n (T12-WF05).
   * Validates correlation between workflowRunId, customerId, and workflowName.
   * Locks WorkflowRun in transaction to prevent out-of-order terminal state transitions.
   * Only allows transitions from active states (PENDING/RUNNING).
   * Returns idempotent response for duplicate matching callbacks, and 409 ConflictException for conflicting ones.
   */
  async handleCustomer360Callback(
    dto: Customer360CallbackDto,
  ): Promise<Customer360CallbackResponseDto> {
    const processCallback = async (repos: {
      workflowRunsRepo: Repository<WorkflowRun>;
      customersRepo: Repository<Customer>;
    }) => {
      const customer = await repos.customersRepo.findOne({
        where: { id: dto.customerId },
      });

      if (!customer) {
        throw new NotFoundException(
          `Customer with ID '${dto.customerId}' not found`,
        );
      }

      const workflowRun = await repos.workflowRunsRepo.findOne({
        where: { id: dto.workflowRunId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!workflowRun) {
        throw new NotFoundException(
          `WorkflowRun with ID '${dto.workflowRunId}' not found`,
        );
      }

      if (workflowRun.customerId !== customer.id) {
        throw new BadRequestException(
          `WorkflowRun '${workflowRun.id}' belongs to customer '${workflowRun.customerId}', not '${customer.id}'`,
        );
      }

      if (workflowRun.workflowName !== 't12-wf05-customer-360') {
        throw new BadRequestException(
          `WorkflowRun '${workflowRun.id}' is associated with workflow '${workflowRun.workflowName}', not 't12-wf05-customer-360'`,
        );
      }

      const isSuccess = dto.status === Customer360Status.SUCCESS;
      const targetStatus = isSuccess
        ? WorkflowStatus.SUCCESS
        : WorkflowStatus.FAILED;

      const isActive =
        workflowRun.status === WorkflowStatus.PENDING ||
        workflowRun.status === WorkflowStatus.RUNNING;
      const callbackExecutionId =
        typeof dto.n8nExecutionId === 'string' ? dto.n8nExecutionId.trim() : '';

      if (!isActive) {
        if (
          workflowRun.n8nExecutionId &&
          callbackExecutionId !== workflowRun.n8nExecutionId
        ) {
          throw new ConflictException(
            `Conflict: WorkflowRun '${workflowRun.id}' belongs to execution '${workflowRun.n8nExecutionId}', not '${callbackExecutionId || 'none'}'`,
          );
        }

        // Run has already concluded in a terminal state
        if (workflowRun.status !== targetStatus) {
          throw new ConflictException(
            `Conflict: WorkflowRun '${workflowRun.id}' is already in terminal state '${workflowRun.status}', cannot transition to '${targetStatus}'`,
          );
        }

        const existingPayload = workflowRun.outputPayload as Record<
          string,
          unknown
        > | null;
        if (isSuccess) {
          if (
            dto.summary &&
            existingPayload?.summary &&
            dto.summary !== existingPayload.summary
          ) {
            throw new ConflictException(
              `Conflict: WorkflowRun '${workflowRun.id}' already completed with a conflicting summary payload`,
            );
          }
        } else {
          if (
            dto.errorMessage &&
            workflowRun.errorMessage &&
            dto.errorMessage !== workflowRun.errorMessage
          ) {
            throw new ConflictException(
              `Conflict: WorkflowRun '${workflowRun.id}' already failed with a conflicting error message`,
            );
          }
        }

        this.logger.warn(
          `Idempotent duplicate Customer 360 callback detected for workflowRunId=${workflowRun.id}`,
        );
        return {
          success: isSuccess,
          customerId: customer.id,
          workflowRunId: workflowRun.id,
        };
      }

      if (!workflowRun.n8nExecutionId) {
        throw new ConflictException(
          `Conflict: WorkflowRun '${workflowRun.id}' has not been claimed by an n8n execution`,
        );
      }

      if (!callbackExecutionId) {
        throw new BadRequestException(
          'n8nExecutionId is required to finalize a claimed Customer 360 WorkflowRun',
        );
      }

      if (workflowRun.n8nExecutionId !== callbackExecutionId) {
        throw new ConflictException(
          `Conflict: WorkflowRun '${workflowRun.id}' is claimed by execution '${workflowRun.n8nExecutionId}'`,
        );
      }

      if (
        !workflowRun.claimExpiresAt ||
        workflowRun.claimExpiresAt.getTime() <= Date.now()
      ) {
        throw new ConflictException(
          `Conflict: WorkflowRun '${workflowRun.id}' lease is missing or has expired for execution '${workflowRun.n8nExecutionId}'`,
        );
      }

      // Transition from active state to terminal state
      workflowRun.status = targetStatus;
      workflowRun.finishedAt = new Date();
      workflowRun.claimExpiresAt = null;
      workflowRun.errorMessage = dto.errorMessage ?? null;
      workflowRun.outputPayload = {
        summary: dto.summary ?? null,
        keyStrengths: dto.keyStrengths || [],
        potentialRisks: dto.potentialRisks || [],
        growthOpportunities: dto.growthOpportunities || [],
        recommendedNextAction: dto.recommendedNextAction ?? null,
        sourceCoverage: dto.sourceCoverage || {
          crmProfile: 'AVAILABLE',
          interactions: 'EMPTY',
          leadIntelligence: 'EMPTY',
          followUps: 'EMPTY',
          segments: 'EMPTY',
          customerIssues: 'NOT_CONNECTED',
          customerFeedback: 'NOT_CONNECTED',
        },
        rawAIOutput: dto.rawAIOutput ?? null,
        modelInfo: {
          provider: 'google',
          model:
            this.configService?.get<string>('GEMINI_MODEL') ||
            'gemini-3.5-flash-lite',
        },
        evaluatedAt: new Date().toISOString(),
      };

      await repos.workflowRunsRepo.save(workflowRun);
      this.logger.log(
        `Updated WorkflowRun ${workflowRun.id} status=${workflowRun.status} for Customer 360 of customer ${customer.id}`,
      );

      return {
        success: isSuccess,
        customerId: customer.id,
        workflowRunId: workflowRun.id,
      };
    };

    if (this.dataSource) {
      return await this.dataSource.transaction(async (manager) => {
        return processCallback({
          workflowRunsRepo: manager.getRepository(WorkflowRun),
          customersRepo: manager.getRepository(Customer),
        });
      });
    }

    if (!this.workflowRunsRepository) {
      throw new InternalServerErrorException(
        'WorkflowRun repository is not configured',
      );
    }

    return await processCallback({
      workflowRunsRepo: this.workflowRunsRepository,
      customersRepo: this.customersRepository,
    });
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

  deriveChurnScoreFromEvidence(
    evidence: Array<Record<string, unknown>>,
    asOfDate?: string,
  ): number | null {
    const validItems = evidence.filter(
      (item) =>
        typeof item.source === 'string' &&
        typeof item.signal === 'string' &&
        item.value !== null &&
        item.value !== undefined,
    );
    if (validItems.length === 0) {
      return null;
    }

    const parsedRef =
      asOfDate && !Number.isNaN(Date.parse(asOfDate))
        ? Date.parse(asOfDate)
        : Date.now();

    let totalScore = 0;

    for (const item of validItems) {
      const source = String(item.source).toLowerCase();
      const signal = String(item.signal).toLowerCase();
      const numericValue =
        typeof item.value === 'number' && Number.isFinite(item.value)
          ? item.value
          : Number(item.value);

      if (
        signal.includes('failed') ||
        signal.includes('retrying') ||
        source.includes('follow_up')
      ) {
        if (Number.isFinite(numericValue) && numericValue > 0) {
          totalScore += Math.min(75, Math.round(numericValue * 25));
        }
        continue;
      }

      if (
        signal.includes('days_since_last_interaction') ||
        signal.includes('inactivity_days')
      ) {
        if (Number.isFinite(numericValue)) {
          if (numericValue >= 60) {
            totalScore += 50;
          } else if (numericValue >= 30) {
            totalScore += 35;
          } else if (numericValue >= 14) {
            totalScore += 15;
          }
        }
        continue;
      }

      if (signal.includes('interaction') || source.includes('interaction')) {
        if (Number.isFinite(numericValue)) {
          if (numericValue <= 0) {
            totalScore += 35;
          } else if (numericValue === 1) {
            totalScore += 20;
          } else if (numericValue === 2) {
            totalScore += 10;
          }
        }

        if (typeof item.observedAt === 'string') {
          const observedTime = Date.parse(item.observedAt);
          if (!Number.isNaN(observedTime)) {
            const daysSince = Math.max(
              0,
              Math.floor((parsedRef - observedTime) / 86_400_000),
            );
            if (daysSince >= 60) {
              totalScore += 50;
            } else if (daysSince >= 30) {
              totalScore += 30;
            } else if (daysSince >= 14) {
              totalScore += 15;
            }
          }
        }
        continue;
      }

      if (
        signal.includes('feedback') ||
        signal.includes('issue') ||
        signal.includes('complaint') ||
        signal.includes('risk')
      ) {
        if (Number.isFinite(numericValue) && numericValue > 0) {
          totalScore += Math.min(70, Math.round(numericValue * 30));
        }
      }
    }

    return Math.min(100, Math.max(0, Math.round(totalScore)));
  }

  private buildCanonicalChurnContextFromCustomer(customer: Customer) {
    const leads = customer.convertedLeads ?? [];
    const leadIds = new Set(
      leads
        .map((lead) => lead.id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const interactions = leads
      .flatMap((lead) => lead.interactions ?? [])
      .sort(
        (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
      );
    const interactionIds = new Set(
      interactions
        .map((interaction) => interaction.id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const enrollments = leads.flatMap((lead) => lead.enrollments ?? []);
    const enrollmentIds = new Set(
      enrollments
        .map((enrollment) => enrollment.id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const executions = enrollments.flatMap(
      (enrollment) => enrollment.executions ?? [],
    );
    const executionIds = new Set(
      executions
        .map((execution) => execution.id)
        .filter((id): id is string => typeof id === 'string'),
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
      leadIds,
      interactionIds,
      enrollmentIds,
      executionIds,
    };
  }

  private validateSubmittedChurnEvidenceScope(
    customerId: string,
    submittedEvidence: Array<Record<string, unknown>>,
    canonical: {
      leadIds: Set<string>;
      interactionIds: Set<string>;
      enrollmentIds: Set<string>;
      executionIds: Set<string>;
    },
  ): void {
    for (const item of submittedEvidence) {
      if (
        typeof item.customerId === 'string' &&
        item.customerId !== customerId
      ) {
        throw new BadRequestException(
          `Submitted churn evidence customerId '${item.customerId}' does not match target customer '${customerId}'`,
        );
      }
      if (
        typeof item.leadId === 'string' &&
        !canonical.leadIds.has(item.leadId)
      ) {
        throw new BadRequestException(
          `Submitted churn evidence leadId '${item.leadId}' does not belong to customer '${customerId}'`,
        );
      }
      if (
        typeof item.interactionId === 'string' &&
        !canonical.interactionIds.has(item.interactionId)
      ) {
        throw new BadRequestException(
          `Submitted churn evidence interactionId '${item.interactionId}' does not belong to customer '${customerId}'`,
        );
      }
      if (
        typeof item.enrollmentId === 'string' &&
        !canonical.enrollmentIds.has(item.enrollmentId)
      ) {
        throw new BadRequestException(
          `Submitted churn evidence enrollmentId '${item.enrollmentId}' does not belong to customer '${customerId}'`,
        );
      }
      if (
        typeof item.executionId === 'string' &&
        !canonical.executionIds.has(item.executionId)
      ) {
        throw new BadRequestException(
          `Submitted churn evidence executionId '${item.executionId}' does not belong to customer '${customerId}'`,
        );
      }
    }
  }

  async createChurnAssessment(
    customerId: string,
    input: {
      score?: number | null;
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

    if (input.score !== undefined && input.score !== null) {
      // Validate range if supplied, but never allow caller-supplied score to override canonical derivation
      this.classifyChurnScore(input.score);
    }

    if (input.workflowRunId && this.workflowRunsRepository) {
      const workflowRun = await this.workflowRunsRepository.findOne({
        where: { id: input.workflowRunId },
      });
      if (!workflowRun) {
        throw new NotFoundException(
          `WorkflowRun with ID '${input.workflowRunId}' not found`,
        );
      }
      const payloadCustomerId = (
        workflowRun.inputPayload as Record<string, unknown> | null
      )?.customerId;
      if (
        typeof payloadCustomerId === 'string' &&
        payloadCustomerId !== customerId
      ) {
        throw new BadRequestException(
          `WorkflowRun '${input.workflowRunId}' belongs to a different customer`,
        );
      }
    }

    const submittedEvidence = Array.isArray(input.evidence)
      ? input.evidence.filter(
          (item) =>
            item !== null && typeof item === 'object' && !Array.isArray(item),
        )
      : [];

    const canonical = this.buildCanonicalChurnContextFromCustomer(customer);
    this.validateSubmittedChurnEvidenceScope(
      customerId,
      submittedEvidence,
      canonical,
    );

    const evidence = canonical.evidence;
    // Server-authoritative UTC assessment date: never trust caller-supplied asOfDate
    const asOfDate = new Date().toISOString().slice(0, 10);
    const score =
      evidence.length > 0
        ? this.deriveChurnScoreFromEvidence(evidence, asOfDate)
        : null;
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

    const existingDaily = await this.churnAssessmentsRepository.findOne({
      where: { customerId, asOfDate },
    });
    if (existingDaily) {
      return existingDaily;
    }

    const assessment = this.churnAssessmentsRepository.create({
      customerId,
      score: score ?? null,
      riskLevel: derivedRisk,
      asOfDate,
      policyVersion: input.policyVersion ?? 'v1',
      evidence,
      coverage: canonical.coverage,
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

    const canonical = this.buildCanonicalChurnContextFromCustomer(customer);

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        companyName: customer.companyName,
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      evidence: canonical.evidence,
      signals: canonical.signals,
      coverage: canonical.coverage,
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
