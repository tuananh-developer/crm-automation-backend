import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import {
  Customer360AiSummaryDto,
  Customer360CallbackDto,
  Customer360CallbackResponseDto,
  Customer360ResponseDto,
  Customer360Status,
  CustomerResponseDto,
  QueryCustomerDto,
  TriggerCustomer360Dto,
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

  /**
   * Aggregates full CRM 360 view for a customer (T12-WF05 / UC05 / 07_API_CONTRACT.md).
   * Combines profile, converted leads, interaction timeline, intelligence history,
   * follow-up sequences, segment memberships, and AI 360 executive summary.
   */
  async getCustomer360(customerId: string): Promise<Customer360ResponseDto> {
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
    if (latestRun?.outputPayload) {
      const p = latestRun.outputPayload as Record<string, unknown>;
      const modelInfo = p.modelInfo as Record<string, unknown> | undefined;
      aiSummary = {
        summary:
          typeof p.summary === 'string'
            ? p.summary
            : 'Customer 360 profile synthesized.',
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
        interactions: 'AVAILABLE',
        leadIntelligence: 'AVAILABLE',
        followUps: 'AVAILABLE',
        segments: 'AVAILABLE',
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
          }
        : null,
    };
  }

  /**
   * Initiates AI Customer 360 analysis workflow (T12-WF05).
   * Creates a correlated WorkflowRun and dispatches an authenticated internal webhook to n8n.
   */
  async triggerCustomer360(
    customerId: string,
    dto?: TriggerCustomer360Dto,
  ): Promise<TriggerCustomer360ResponseDto> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    // 1. Create correlated WorkflowRun in PENDING status
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 't12-wf05-customer-360',
      customerId: customer.id,
      triggeredByUserId: dto?.userId ?? null,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        companyName: customer.companyName,
        requestedAt: new Date().toISOString(),
      },
    });

    const savedRun = await this.workflowRunsRepository.save(workflowRun);
    this.logger.log(
      `Created WorkflowRun ${savedRun.id} for Customer 360 of customer ${customer.id}`,
    );

    // 2. Dispatch internal webhook to n8n asynchronously
    const n8nBaseUrl =
      this.configService.get<string>('N8N_WEBHOOK_BASE_URL') ||
      'http://crm_n8n:5678/webhook';
    const webhookUrl = `${n8nBaseUrl}/t12-wf05-customer-360`;

    // Fire and forget webhook call to avoid blocking NestJS response
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY':
          this.configService.get<string>('N8N_API_KEY') ||
          'crm-automation-n8n-secret-key',
      },
      body: JSON.stringify({
        customerId: customer.id,
        workflowRunId: savedRun.id,
        timestamp: new Date().toISOString(),
      }),
    })
      .then((res) => {
        if (!res.ok) {
          this.logger.warn(
            `n8n webhook dispatch returned HTTP ${res.status} for run ${savedRun.id}`,
          );
        } else {
          this.logger.log(
            `n8n webhook successfully dispatched for run ${savedRun.id}`,
          );
        }
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `n8n webhook dispatch error for run ${savedRun.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return {
      message: 'Customer 360 analysis workflow triggered successfully',
      customerId: customer.id,
      workflowRunId: savedRun.id,
    };
  }

  /**
   * Receives AI Customer 360 callback from n8n (T12-WF05).
   * Stores the executive summary, risks, opportunities into WorkflowRun outputPayload.
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

    let workflowRun = await this.workflowRunsRepository.findOne({
      where: { id: dto.workflowRunId },
    });

    if (!workflowRun) {
      workflowRun = this.workflowRunsRepository.create({
        id: dto.workflowRunId,
        workflowName: 't12-wf05-customer-360',
        customerId: customer.id,
      });
    }

    const isSuccess = dto.status === Customer360Status.SUCCESS;
    workflowRun.status = isSuccess
      ? WorkflowStatus.SUCCESS
      : WorkflowStatus.FAILED;
    workflowRun.finishedAt = new Date();
    workflowRun.errorMessage = dto.errorMessage ?? null;
    workflowRun.outputPayload = {
      summary: dto.summary,
      keyStrengths: dto.keyStrengths || [],
      potentialRisks: dto.potentialRisks || [],
      growthOpportunities: dto.growthOpportunities || [],
      recommendedNextAction: dto.recommendedNextAction,
      sourceCoverage: dto.sourceCoverage || {
        crmProfile: 'AVAILABLE',
        interactions: 'AVAILABLE',
        leadIntelligence: 'AVAILABLE',
        followUps: 'AVAILABLE',
        segments: 'AVAILABLE',
        customerIssues: 'NOT_CONNECTED',
        customerFeedback: 'NOT_CONNECTED',
      },
      rawAIOutput: dto.rawAIOutput,
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
      success: true,
      customerId: customer.id,
      workflowRunId: workflowRun.id,
    };
  }
}
