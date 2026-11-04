import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Customer } from './entities/customer.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { Segment } from './entities/segment.entity.js';
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
  Customer360AiSummaryDto,
  Customer360CallbackDto,
  Customer360CallbackResponseDto,
  Customer360ResponseDto,
  Customer360Status,
  CustomerResponseDto,
  QueryCustomerDto,
  TriggerCustomer360ResponseDto,
} from './dto/index.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import { CustomerMapper } from './mappers/customer.mapper.js';

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

    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,

    @InjectRepository(Interaction)
    private readonly interactionsRepository: Repository<Interaction>,

    @InjectRepository(LeadQualification)
    private readonly qualificationsRepository: Repository<LeadQualification>,

    @InjectRepository(LeadEnrichment)
    private readonly enrichmentsRepository: Repository<LeadEnrichment>,

    @InjectRepository(LeadScore)
    private readonly scoresRepository: Repository<LeadScore>,

    @InjectRepository(WorkflowRun)
    private readonly workflowRunsRepository: Repository<WorkflowRun>,

    @InjectRepository(LeadFollowUpEnrollment)
    private readonly enrollmentsRepository: Repository<LeadFollowUpEnrollment>,

    @InjectRepository(FollowUpExecution)
    private readonly executionsRepository: Repository<FollowUpExecution>,

    private readonly configService: ConfigService,
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
      interactions = await this.interactionsRepository.find({
        where: { leadId: In(convertedLeadIds) },
        order: { occurredAt: 'DESC' },
      });

      qualifications = await this.qualificationsRepository.find({
        where: { leadId: In(convertedLeadIds) },
        order: { createdAt: 'DESC' },
      });

      enrichments = await this.enrichmentsRepository.find({
        where: { leadId: In(convertedLeadIds) },
        order: { enrichedAt: 'DESC' },
      });

      scores = await this.scoresRepository.find({
        where: { leadId: In(convertedLeadIds) },
        order: { createdAt: 'DESC' },
      });

      enrollments = await this.enrollmentsRepository.find({
        where: { leadId: In(convertedLeadIds) },
        order: { createdAt: 'DESC' },
        relations: { sequence: true },
      });

      const enrollmentIds = enrollments.map((e) => e.id);
      if (enrollmentIds.length > 0) {
        executions = await this.executionsRepository.find({
          where: { enrollmentId: In(enrollmentIds) },
          order: { scheduledAt: 'DESC' },
          relations: { step: true },
        });
      }
    }

    // Fetch latest completed WorkflowRun for Customer 360
    const latestRun = await this.workflowRunsRepository.findOne({
      where: {
        customerId,
        workflowName: 't12-wf05-customer-360',
      },
      order: { startedAt: 'DESC' },
    });

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
        customerFeedback: 'NOT_CONNECTED',
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
    return this.interactionsRepository.find({
      where: { leadId: In(leadIds) },
      order: { occurredAt: 'DESC' },
    });
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
      this.qualificationsRepository.find({
        where: { leadId: In(leadIds) },
        order: { createdAt: 'DESC' },
      }),
      this.enrichmentsRepository.find({
        where: { leadId: In(leadIds) },
        order: { enrichedAt: 'DESC' },
      }),
      this.scoresRepository.find({
        where: { leadId: In(leadIds) },
        order: { createdAt: 'DESC' },
      }),
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

    const enrollments = await this.enrollmentsRepository.find({
      where: { leadId: In(leadIds) },
      order: { createdAt: 'DESC' },
      relations: { sequence: true },
    });

    const enrollmentIds = enrollments.map((e) => e.id);
    let executions: FollowUpExecution[] = [];
    if (enrollmentIds.length > 0) {
      executions = await this.executionsRepository.find({
        where: { enrollmentId: In(enrollmentIds) },
        order: { scheduledAt: 'DESC' },
        relations: { step: true },
      });
    }

    return { enrollments, executions };
  }

  /**
   * Retrieves segment memberships for a customer (for n8n Node 7).
   */
  async getCustomerSegments(
    customerId: string,
    user?: AuthenticatedUser,
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
   * Retrieves feedback history for a customer (for n8n Node 8).
   */
  async getCustomerFeedback(
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

    try {
      const feedback: unknown = await this.customersRepository.query(
        `SELECT * FROM customer_feedback WHERE customer_id = $1 ORDER BY created_at DESC`,
        [customerId],
      );
      return Array.isArray(feedback)
        ? (feedback as Record<string, unknown>[])
        : [];
    } catch {
      return [];
    }
  }

  /**
   * Initiates AI Customer 360 analysis workflow (T12-WF05).
   * Creates a correlated WorkflowRun and dispatches an authenticated internal webhook to n8n.
   * Enforces object-level authorization and binds triggeredByUserId to authenticated caller.
   */
  async triggerCustomer360(
    customerId: string,
    user: AuthenticatedUser,
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
      this.configService.get<string>('N8N_API_KEY') ||
      this.configService.get<string>('N8N_WEBHOOK_SECRET');

    if (!n8nApiKey) {
      throw new InternalServerErrorException(
        'Webhook authentication secret (N8N_API_KEY / N8N_WEBHOOK_SECRET) is not configured',
      );
    }

    // 1. Create correlated WorkflowRun in PENDING status with verified user id
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 't12-wf05-customer-360',
      customerId: customer.id,
      triggeredByUserId: user.id,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        companyName: customer.companyName,
        triggeredByUserId: user.id,
        requestedAt: new Date().toISOString(),
      },
    });

    const savedRun = await this.workflowRunsRepository.save(workflowRun);
    this.logger.log(
      `Created WorkflowRun ${savedRun.id} for Customer 360 of customer ${customer.id} by user ${user.id}`,
    );

    // 2. Dispatch internal webhook to n8n
    const n8nBaseUrl =
      this.configService.get<string>('N8N_WEBHOOK_BASE_URL') ||
      'http://crm_n8n:5678/webhook';
    const webhookUrl = `${n8nBaseUrl}/t12-wf05-customer-360`;

    let dispatchRes: Response;
    try {
      dispatchRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': n8nApiKey,
        },
        body: JSON.stringify({
          customerId: customer.id,
          workflowRunId: savedRun.id,
          triggeredByUserId: user.id,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: unknown) {
      const errMsg = `Failed to dispatch Customer 360 workflow to n8n: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error(errMsg);
      savedRun.status = WorkflowStatus.FAILED;
      savedRun.finishedAt = new Date();
      savedRun.errorMessage = errMsg;
      await this.workflowRunsRepository.save(savedRun);
      throw new BadGatewayException(errMsg);
    }

    if (!dispatchRes.ok) {
      const errMsg = `n8n webhook dispatch returned HTTP ${dispatchRes.status} ${dispatchRes.statusText}`;
      this.logger.error(errMsg);
      savedRun.status = WorkflowStatus.FAILED;
      savedRun.finishedAt = new Date();
      savedRun.errorMessage = errMsg;
      await this.workflowRunsRepository.save(savedRun);
      throw new BadGatewayException(errMsg);
    }

    this.logger.log(
      `n8n webhook successfully dispatched for run ${savedRun.id}`,
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
   * Rejects untrusted/unknown runs and accurately reports workflow outcome.
   */
  async handleCustomer360Callback(
    dto: Customer360CallbackDto,
  ): Promise<Customer360CallbackResponseDto> {
    const customer = await this.customersRepository.findOne({
      where: { id: dto.customerId },
    });

    if (!customer) {
      throw new NotFoundException(
        `Customer with ID '${dto.customerId}' not found`,
      );
    }

    const workflowRun = await this.workflowRunsRepository.findOne({
      where: { id: dto.workflowRunId },
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
    workflowRun.status = isSuccess
      ? WorkflowStatus.SUCCESS
      : WorkflowStatus.FAILED;
    workflowRun.finishedAt = new Date();
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
          this.configService.get<string>('GEMINI_MODEL') ||
          'gemini-3.5-flash-lite',
      },
      evaluatedAt: new Date().toISOString(),
    };

    await this.workflowRunsRepository.save(workflowRun);
    this.logger.log(
      `Updated WorkflowRun ${workflowRun.id} status=${workflowRun.status} for Customer 360 of customer ${customer.id}`,
    );

    return {
      success: isSuccess,
      customerId: customer.id,
      workflowRunId: workflowRun.id,
    };
  }
}
