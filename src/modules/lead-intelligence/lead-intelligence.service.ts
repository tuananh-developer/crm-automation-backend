import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadQualification } from './entities/lead-qualification.entity.js';
import { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { ReviewTask } from '../review/entities/review-task.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import {
  EnrichmentStatus,
  QualificationStatus,
} from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ReviewStatus } from '../review/enums/review.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import {
  EnrichmentCallbackDto,
  QualificationCallbackDto,
  TriggerEnrichmentDto,
  TriggerQualificationDto,
} from './dto/index.js';

export const CONFIDENCE_THRESHOLD = 0.8;

/** Default enrichment provider when none is specified in the trigger request. */
export const DEFAULT_ENRICHMENT_PROVIDER = 'mock';

@Injectable()
export class LeadIntelligenceService {
  private readonly logger = new Logger(LeadIntelligenceService.name);

  constructor(
    @InjectRepository(LeadQualification)
    private readonly qualificationsRepository: Repository<LeadQualification>,
    @InjectRepository(LeadEnrichment)
    private readonly enrichmentsRepository: Repository<LeadEnrichment>,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunsRepository: Repository<WorkflowRun>,
    @InjectRepository(ReviewTask)
    private readonly reviewTasksRepository: Repository<ReviewTask>,
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    private readonly rabbitmqService: RabbitMQService,
  ) {}

  async triggerQualification(
    leadId: string,
    dto?: TriggerQualificationDto,
  ): Promise<{ message: string; workflowRunId: string; leadId: string }> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }

    // Update lead status to QUALIFYING
    lead.status = LeadStatus.QUALIFYING;
    await this.leadsRepository.save(lead);

    // Create workflow run record
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 'lead-qualification',
      leadId: lead.id,
      triggeredByUserId: dto?.userId ?? null,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        leadId: lead.id,
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        companyName: lead.companyName,
        jobTitle: lead.jobTitle,
        industry: lead.industry,
        companySize: lead.companySize,
        notes: lead.notes,
      },
    });

    const savedWorkflowRun =
      await this.workflowRunsRepository.save(workflowRun);
    this.logger.log(
      `Created WorkflowRun ${savedWorkflowRun.id} for lead ${lead.id}`,
    );

    // Publish event to RabbitMQ for n8n consumption
    await this.rabbitmqService.publishLeadQualificationRequested({
      leadId: lead.id,
      workflowRunId: savedWorkflowRun.id,
    });

    return {
      message: 'Lead qualification workflow triggered successfully',
      workflowRunId: savedWorkflowRun.id,
      leadId: lead.id,
    };
  }

  async handleQualificationCallback(dto: QualificationCallbackDto): Promise<{
    qualification: LeadQualification;
    leadStatus: LeadStatus;
    reviewRequired: boolean;
    reviewTaskId?: string;
  }> {
    const lead = await this.leadsRepository.findOne({
      where: { id: dto.leadId },
    });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
    }

    // 1. Create and save LeadQualification
    const qualification = this.qualificationsRepository.create({
      leadId: dto.leadId,
      workflowRunId: dto.workflowRunId ?? null,
      status: dto.status,
      intent: dto.intent ?? null,
      confidence: dto.confidence,
      reason: dto.reason ?? null,
      modelProvider: dto.modelProvider ?? null,
      modelName: dto.modelName ?? null,
      modelVersion: dto.modelVersion ?? null,
      inputSnapshot: dto.inputSnapshot ?? null,
      outputSnapshot: dto.outputSnapshot ?? null,
    });

    const savedQualification =
      await this.qualificationsRepository.save(qualification);
    this.logger.log(
      `Saved LeadQualification ${savedQualification.id} for lead ${lead.id}`,
    );

    // 2. Update WorkflowRun if found
    const workflowRun = dto.workflowRunId
      ? await this.workflowRunsRepository.findOne({
          where: { id: dto.workflowRunId },
        })
      : await this.workflowRunsRepository.findOne({
          where: {
            leadId: dto.leadId,
            workflowName: 'lead-qualification',
            status: WorkflowStatus.PENDING,
          },
          order: { createdAt: 'DESC' },
        });

    if (workflowRun) {
      workflowRun.status = WorkflowStatus.SUCCESS;
      workflowRun.finishedAt = new Date();
      workflowRun.outputPayload = {
        qualificationId: savedQualification.id,
        status: dto.status,
        confidence: dto.confidence,
        reason: dto.reason,
        intent: dto.intent,
        nextAction: dto.nextAction,
        reviewRequired: dto.reviewRequired,
      };
      await this.workflowRunsRepository.save(workflowRun);
    }

    // 3. Apply Confidence Threshold Rule
    const isConfidenceBelowThreshold = dto.confidence < CONFIDENCE_THRESHOLD;
    const reviewRequired =
      isConfidenceBelowThreshold ||
      dto.reviewRequired === true ||
      dto.status === QualificationStatus.NEEDS_REVIEW;

    let reviewTaskId: string | undefined;

    if (reviewRequired) {
      this.logger.warn(
        `Lead ${lead.id} qualification confidence (${dto.confidence}) is below threshold ${CONFIDENCE_THRESHOLD} or flagged for review. Creating ReviewTask.`,
      );

      // Lead stays in QUALIFYING until human review is completed
      lead.status = LeadStatus.QUALIFYING;

      const reason =
        dto.reason ||
        `AI qualification confidence (${(dto.confidence * 100).toFixed(1)}%) is below required threshold (80%). Manual review required.`;

      const reviewTask = this.reviewTasksRepository.create({
        leadId: lead.id,
        workflowRunId: workflowRun?.id ?? null,
        assignedTo: lead.ownerId ?? null,
        status: ReviewStatus.PENDING,
        reason,
      });

      const savedReviewTask = await this.reviewTasksRepository.save(reviewTask);
      reviewTaskId = savedReviewTask.id;

      // If lead has an owner, notify them
      if (lead.ownerId) {
        const notification = this.notificationsRepository.create({
          userId: lead.ownerId,
          type: 'REVIEW_REQUIRED',
          title: 'Review Required: Low Confidence AI Qualification',
          content: `Lead ${lead.firstName} ${lead.lastName || ''} requires human review: ${reason}`,
          leadId: lead.id,
          reviewTaskId: savedReviewTask.id,
          isRead: false,
        });
        await this.notificationsRepository.save(notification);
      }
    } else {
      // Automatic acceptance
      if (dto.status === QualificationStatus.QUALIFIED) {
        lead.status = LeadStatus.QUALIFIED;
      } else if (dto.status === QualificationStatus.DISQUALIFIED) {
        lead.status = LeadStatus.LOST;
      }
      this.logger.log(
        `Lead ${lead.id} automatically updated to status '${lead.status}' (confidence: ${dto.confidence})`,
      );
    }

    await this.leadsRepository.save(lead);

    return {
      qualification: savedQualification,
      leadStatus: lead.status,
      reviewRequired,
      reviewTaskId,
    };
  }

  async getQualificationsByLead(leadId: string): Promise<LeadQualification[]> {
    return this.qualificationsRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: {
        workflowRun: true,
      },
    });
  }

  async getLatestQualification(
    leadId: string,
  ): Promise<LeadQualification | null> {
    return this.qualificationsRepository.findOne({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: {
        workflowRun: true,
      },
    });
  }

  // ── Enrichment ────────────────────────────────────────────────────────────

  /**
   * Trigger the lead enrichment workflow:
   *  1. Create a WorkflowRun record with status PENDING.
   *  2. Create a LeadEnrichment record with status PENDING.
   *  3. Publish `lead.enrichment.requested` event to RabbitMQ for n8n.
   */
  async triggerEnrichment(
    leadId: string,
    dto?: TriggerEnrichmentDto,
  ): Promise<{
    message: string;
    workflowRunId: string;
    enrichmentId: string;
    leadId: string;
  }> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }

    const provider = dto?.provider ?? DEFAULT_ENRICHMENT_PROVIDER;

    // 1. Create WorkflowRun
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 'lead-enrichment',
      leadId: lead.id,
      triggeredByUserId: dto?.userId ?? null,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        leadId: lead.id,
        provider,
        email: lead.email,
        companyName: lead.companyName,
        companyWebsite: lead.companyWebsite,
      },
    });
    const savedWorkflowRun =
      await this.workflowRunsRepository.save(workflowRun);
    this.logger.log(
      `Created WorkflowRun ${savedWorkflowRun.id} for lead enrichment of lead ${lead.id}`,
    );

    // 2. Create pending LeadEnrichment record
    const enrichment = this.enrichmentsRepository.create({
      leadId: lead.id,
      workflowRunId: savedWorkflowRun.id,
      provider,
      status: EnrichmentStatus.PENDING,
      enrichedAt: new Date(),
    });
    const savedEnrichment = await this.enrichmentsRepository.save(enrichment);
    this.logger.log(
      `Created LeadEnrichment ${savedEnrichment.id} (status=PENDING) for lead ${lead.id}`,
    );

    // 3. Publish event
    await this.rabbitmqService.publishLeadEnrichmentRequested({
      leadId: lead.id,
      workflowRunId: savedWorkflowRun.id,
      provider,
      email: lead.email ?? undefined,
      companyName: lead.companyName ?? undefined,
      companyWebsite: lead.companyWebsite ?? undefined,
    });

    return {
      message: 'Lead enrichment workflow triggered successfully',
      workflowRunId: savedWorkflowRun.id,
      enrichmentId: savedEnrichment.id,
      leadId: lead.id,
    };
  }

  /**
   * Handle the callback from n8n after enrichment completes:
   *  1. Find the pending LeadEnrichment record (by workflowRunId or latest).
   *  2. Update it with the enriched data & final status.
   *  3. Update the WorkflowRun to SUCCESS or FAILED.
   *  4. On partial failure, log a warning; on full failure, store errorMessage.
   */
  async handleEnrichmentCallback(dto: EnrichmentCallbackDto): Promise<{
    enrichment: LeadEnrichment;
    workflowRunUpdated: boolean;
  }> {
    const lead = await this.leadsRepository.findOne({
      where: { id: dto.leadId },
    });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
    }

    // 1. Find the pending enrichment record
    const enrichment = dto.workflowRunId
      ? await this.enrichmentsRepository.findOne({
          where: { workflowRunId: dto.workflowRunId, leadId: dto.leadId },
        })
      : await this.enrichmentsRepository.findOne({
          where: { leadId: dto.leadId, status: EnrichmentStatus.PENDING },
          order: { createdAt: 'DESC' },
        });

    // If no pending record exists (edge-case / retry), create a fresh one
    const target =
      enrichment ??
      this.enrichmentsRepository.create({
        leadId: dto.leadId,
        workflowRunId: dto.workflowRunId ?? null,
        provider: dto.provider,
        status: EnrichmentStatus.PENDING,
        enrichedAt: new Date(),
      });

    // 2. Apply enriched data
    target.status = dto.status;
    target.provider = dto.provider;
    target.externalRequestId = dto.externalRequestId ?? null;
    target.companyName = dto.companyName ?? null;
    target.companyWebsite = dto.companyWebsite ?? null;
    target.companyIndustry = dto.companyIndustry ?? null;
    target.companySize = dto.companySize ?? null;
    target.contactJobTitle = dto.contactJobTitle ?? null;
    target.contactLinkedinUrl = dto.contactLinkedinUrl ?? null;
    target.rawResponse = dto.rawResponse ?? null;
    target.errorMessage = dto.errorMessage ?? null;
    target.enrichedAt = new Date();

    const savedEnrichment = await this.enrichmentsRepository.save(target);
    this.logger.log(
      `Updated LeadEnrichment ${savedEnrichment.id} to status=${dto.status} for lead ${dto.leadId}`,
    );

    // Update Lead with enriched fields if successful or partial
    if (
      dto.status === EnrichmentStatus.SUCCESS ||
      dto.status === EnrichmentStatus.PARTIAL
    ) {
      if (dto.companyName) lead.companyName = dto.companyName;
      if (dto.companyWebsite) lead.companyWebsite = dto.companyWebsite;
      if (dto.companyIndustry) lead.industry = dto.companyIndustry;
      if (dto.companySize) lead.companySize = dto.companySize;
      if (dto.contactJobTitle) lead.jobTitle = dto.contactJobTitle;
      await this.leadsRepository.save(lead);
      this.logger.log(`Updated Lead ${lead.id} profile with enriched details`);
    }

    // 3. Update WorkflowRun

    let workflowRunUpdated = false;
    const workflowRunId =
      dto.workflowRunId ?? savedEnrichment.workflowRunId ?? null;

    if (workflowRunId) {
      const workflowRun = await this.workflowRunsRepository.findOne({
        where: { id: workflowRunId },
      });
      if (workflowRun) {
        const isFailure = dto.status === EnrichmentStatus.FAILED;
        workflowRun.status = isFailure
          ? WorkflowStatus.FAILED
          : WorkflowStatus.SUCCESS;
        workflowRun.finishedAt = new Date();
        workflowRun.errorMessage = dto.errorMessage ?? null;
        workflowRun.outputPayload = {
          enrichmentId: savedEnrichment.id,
          status: dto.status,
          provider: dto.provider,
          companyName: dto.companyName,
          companyWebsite: dto.companyWebsite,
          companyIndustry: dto.companyIndustry,
        };
        await this.workflowRunsRepository.save(workflowRun);
        workflowRunUpdated = true;
      }
    }

    if (dto.status === EnrichmentStatus.PARTIAL) {
      this.logger.warn(
        `Lead ${dto.leadId} enrichment partially succeeded (provider: ${dto.provider}): ${dto.errorMessage ?? 'no details'}`,
      );
    } else if (dto.status === EnrichmentStatus.FAILED) {
      this.logger.error(
        `Lead ${dto.leadId} enrichment failed (provider: ${dto.provider}): ${dto.errorMessage ?? 'unknown error'}`,
      );
    }

    return { enrichment: savedEnrichment, workflowRunUpdated };
  }

  async getEnrichmentsByLead(leadId: string): Promise<LeadEnrichment[]> {
    return this.enrichmentsRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { workflowRun: true },
    });
  }

  async getLatestEnrichment(leadId: string): Promise<LeadEnrichment | null> {
    return this.enrichmentsRepository.findOne({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { workflowRun: true },
    });
  }

  /**
   * Mock external enrichment service for local development, n8n workflows, and testing.
   * Can simulate failure with `fail=true` to test retries and error handling.
   */
  mockEnrichment(query: {
    domain?: string;
    email?: string;
    provider?: string;
    fail?: string;
  }) {
    if (query.fail === 'true' || query.domain === 'fail-retry.test') {
      throw new InternalServerErrorException(
        'Simulated external enrichment service failure (for retry testing)',
      );
    }

    const domain =
      query.domain ||
      (query.email && query.email.includes('@')
        ? query.email.split('@')[1]
        : 'enterprise.com');
    const namePart = domain ? domain.split('.')[0] : 'Enterprise';
    const capitalizedName =
      namePart.charAt(0).toUpperCase() + namePart.slice(1);

    return {
      provider: query.provider || 'mock',
      externalRequestId: `ext-${Date.now()}`,
      company: {
        name: `${capitalizedName} Solutions`,
        website: `https://${domain}`,
        industry: 'Software & Technology',
        size: 150,
      },
      contact: {
        jobTitle: 'Director of Operations',
        linkedinUrl: `https://linkedin.com/company/${namePart}`,
      },
      rawResponse: {
        source: 'mock-enrichment-v1',
        query: { domain, email: query.email },
        timestamp: new Date().toISOString(),
        score: 0.95,
      },
    };
  }
}
