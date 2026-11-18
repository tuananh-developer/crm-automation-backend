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
import { DataSource, Repository } from 'typeorm';
import { LeadQualification } from './entities/lead-qualification.entity.js';
import { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import { LeadScore } from './entities/lead-score.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { ReviewTask } from '../review/entities/review-task.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import {
  EnrichmentStatus,
  QualificationStatus,
  ScoreLabel,
} from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ReviewStatus } from '../review/enums/review.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import { CRM_EVENTS } from '../../infrastructure/rabbitmq/rabbitmq.constants.js';
import {
  computeScoreLabel,
  EnrichmentCallbackDto,
  QualificationCallbackDto,
  ScoringCallbackDto,
  TriggerEnrichmentDto,
  TriggerEnrichmentResponseDto,
  TriggerQualificationDto,
  TriggerQualificationResponseDto,
  TriggerScoringDto,
  TriggerScoringResponseDto,
} from './dto/index.js';
import type { EnsureQualificationReviewerNotificationDto } from './dto/ensure-qualification-reviewer-notification.dto.js';

export const CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_ENRICHMENT_PROVIDER = 'mock';

@Injectable()
export class LeadIntelligenceService {
  private readonly logger = new Logger(LeadIntelligenceService.name);

  constructor(
    @InjectRepository(LeadQualification)
    private readonly qualificationsRepository: Repository<LeadQualification>,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunsRepository: Repository<WorkflowRun>,
    @InjectRepository(ReviewTask)
    private readonly reviewTasksRepository: Repository<ReviewTask>,
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    private readonly rabbitmqService: RabbitMQService,
    @InjectRepository(LeadScore)
    private readonly scoresRepository: Repository<LeadScore>,
    @InjectRepository(Interaction)
    private readonly interactionsRepository: Repository<Interaction>,
    @InjectRepository(LeadEnrichment)
    private readonly enrichmentsRepository: Repository<LeadEnrichment>,
    @Optional()
    private readonly dataSource?: DataSource,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  async triggerQualification(
    leadId: string,
    dto?: TriggerQualificationDto,
    actor?: AuthenticatedUser,
  ): Promise<TriggerQualificationResponseDto> {
    const lead = await this.assertLeadAccessById(leadId, actor);

    // Update lead status to QUALIFYING
    lead.status = LeadStatus.QUALIFYING;
    await this.leadsRepository.save(lead);

    // Create workflow run record
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 'lead-qualification',
      leadId: lead.id,
      triggeredByUserId: actor?.id ?? null,
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

    const savedWorkflowRun = this.dataSource
      ? await this.dataSource.transaction(async (manager) => {
          await manager.save(lead);
          const persistedRun = await manager.save(WorkflowRun, workflowRun);
          await this.rabbitmqService.enqueueEvent(
            manager,
            CRM_EVENTS.LEAD_QUALIFICATION_REQUESTED,
            { leadId: lead.id, workflowRunId: persistedRun.id },
          );
          return persistedRun;
        })
      : await (async () => {
          // Keep the repository-only fallback consistent with the transactional
          // path: persist the status transition before creating the WorkflowRun.
          await this.leadsRepository.save(lead);
          return this.workflowRunsRepository.save(workflowRun);
        })();
    this.logger.log(
      `Created WorkflowRun ${savedWorkflowRun.id} for lead ${lead.id}`,
    );

    // Publish event to RabbitMQ for n8n consumption
    if (!this.dataSource) {
      await this.rabbitmqService.publishLeadQualificationRequested({
        leadId: lead.id,
        workflowRunId: savedWorkflowRun.id,
      });
    }

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
    const processQualification = async (
      repos: {
        leadRepo: Repository<Lead>;
        qualificationRepo: Repository<LeadQualification>;
        workflowRunRepo: Repository<WorkflowRun>;
        reviewTaskRepo: Repository<ReviewTask>;
        notificationRepo: Repository<Notification>;
      },
      lockLeadForUpdate = false,
    ) => {
      // Different WorkflowRuns for the same Lead are independent rows. Lock the
      // Lead itself so concurrent qualification callbacks cannot both observe
      // "no pending ReviewTask" and create duplicate tasks.
      const lead = await repos.leadRepo.findOne({
        where: { id: dto.leadId },
        ...(lockLeadForUpdate
          ? { lock: { mode: 'pessimistic_write' as const } }
          : {}),
      });
      if (!lead) {
        throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
      }

      const workflowRun = await repos.workflowRunRepo.findOne({
        where: {
          id: dto.workflowRunId,
          leadId: lead.id,
          workflowName: 'lead-qualification',
        },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertCallbackRunScope(workflowRun, lead.id, 'lead-qualification');

      const existingQualification = await repos.qualificationRepo.findOne({
        where: { workflowRunId: dto.workflowRunId, leadId: lead.id },
      });
      if (
        existingQualification &&
        this.isTerminalWorkflowStatus(workflowRun.status)
      ) {
        const currentLead = await repos.leadRepo.findOne({
          where: { id: lead.id },
        });
        const reviewTask = await repos.reviewTaskRepo.findOne({
          where: { workflowRunId: workflowRun.id },
        });
        return {
          qualification: existingQualification,
          leadStatus: currentLead?.status ?? lead.status,
          reviewRequired: Boolean(reviewTask),
          reviewTaskId: reviewTask?.id,
        };
      }
      this.assertCallbackRunActive(workflowRun);

      // 1. Create and save LeadQualification
      const qualification = repos.qualificationRepo.create({
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
        await repos.qualificationRepo.save(qualification);
      this.logger.log(
        `Saved LeadQualification ${savedQualification.id} for lead ${lead.id}`,
      );

      // 2. Update WorkflowRun if found
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
      await repos.workflowRunRepo.save(workflowRun);

      // 3. Apply Confidence Threshold Rule
      const isConfidenceBelowThreshold = dto.confidence <= CONFIDENCE_THRESHOLD;
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

        // Check if a pending ReviewTask already exists for this lead (Idempotency Guard)
        const existingPendingTask = await repos.reviewTaskRepo.findOne({
          where: {
            leadId: lead.id,
            status: ReviewStatus.PENDING,
          },
        });

        if (!existingPendingTask) {
          const reviewTask = repos.reviewTaskRepo.create({
            leadId: lead.id,
            workflowRunId: workflowRun?.id ?? null,
            assignedTo: lead.ownerId ?? null,
            status: ReviewStatus.PENDING,
            reason,
          });

          const savedReviewTask = await repos.reviewTaskRepo.save(reviewTask);
          reviewTaskId = savedReviewTask.id;

          // If lead has an owner, notify them
          if (lead.ownerId) {
            const notification = repos.notificationRepo.create({
              userId: lead.ownerId,
              type: 'REVIEW_REQUIRED',
              title: 'Review Required: Low Confidence AI Qualification',
              content: `Lead ${lead.firstName} ${lead.lastName || ''} requires human review: ${reason}`,
              leadId: lead.id,
              reviewTaskId: savedReviewTask.id,
              isRead: false,
            });
            await repos.notificationRepo.save(notification);
          }
        } else {
          reviewTaskId = existingPendingTask.id;
          this.logger.log(
            `Reusing existing pending ReviewTask ${existingPendingTask.id} for lead ${lead.id}`,
          );
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

      await repos.leadRepo.save(lead);

      return {
        qualification: savedQualification,
        leadStatus: lead.status,
        reviewRequired,
        reviewTaskId,
      };
    };

    if (this.dataSource) {
      return await this.dataSource.transaction(async (manager) => {
        return processQualification(
          {
            leadRepo: manager.getRepository(Lead),
            qualificationRepo: manager.getRepository(LeadQualification),
            workflowRunRepo: manager.getRepository(WorkflowRun),
            reviewTaskRepo: manager.getRepository(ReviewTask),
            notificationRepo: manager.getRepository(Notification),
          },
          true,
        );
      });
    }

    return await processQualification({
      leadRepo: this.leadsRepository,
      qualificationRepo: this.qualificationsRepository,
      workflowRunRepo: this.workflowRunsRepository,
      reviewTaskRepo: this.reviewTasksRepository,
      notificationRepo: this.notificationsRepository,
    });
  }

  /**
   * Read the minimal authoritative Lead context required by WF01.
   * This internal endpoint is scoped to a pending/running qualification run
   * so completed or unrelated workflow runs cannot be replayed to the LLM.
   */
  async getLeadContextForN8n(
    leadId: string,
    workflowRunId: string,
  ): Promise<{
    data: {
      id: string;
      companyName: string | null;
      companyWebsite: string | null;
      jobTitle: string | null;
      companySize: number | null;
      industry: string | null;
      status: LeadStatus;
      createdAt: Date;
    };
  }> {
    await this.assertActiveQualificationRun(leadId, workflowRunId);

    // WF01 only needs company/profile attributes. Do not transfer direct
    // contact identifiers or free-form notes into n8n execution data.
    const lead = await this.leadsRepository.findOne({
      where: { id: leadId },
      select: {
        id: true,
        companyName: true,
        companyWebsite: true,
        jobTitle: true,
        companySize: true,
        industry: true,
        status: true,
        createdAt: true,
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }

    return {
      data: {
        id: lead.id,
        companyName: lead.companyName,
        companyWebsite: lead.companyWebsite,
        jobTitle: lead.jobTitle,
        companySize: lead.companySize,
        industry: lead.industry,
        status: lead.status,
        createdAt: lead.createdAt,
      },
    };
  }

  /**
   * Read a bounded set of recent Lead interactions for WF01. The response is
   * intentionally projected and content is capped before being sent to an LLM.
   */
  async getLeadInteractionContextForN8n(
    leadId: string,
    workflowRunId: string,
    limit = 20,
  ): Promise<{
    items: Array<{
      id: string;
      type: string;
      channel: string | null;
      occurredAt: Date;
    }>;
  }> {
    await this.assertActiveQualificationRun(leadId, workflowRunId);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }

    const lead = await this.leadsRepository.findOne({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }

    const interactions = await this.interactionsRepository.find({
      where: { leadId },
      // WF01 uses engagement metadata only; do not copy message text
      // or subject lines into the n8n execution payload.
      select: {
        id: true,
        type: true,
        channel: true,
        occurredAt: true,
      },
      order: { occurredAt: 'DESC' },
      take: limit,
    });

    return {
      items: interactions.map((interaction) => ({
        id: interaction.id,
        type: interaction.type,
        channel: interaction.channel,
        occurredAt: interaction.occurredAt,
      })),
    };
  }

  /**
   * Return the reviewer notification already created by the qualification
   * callback. This endpoint is deliberately read-only: it must never create a
   * second ReviewTask or Notification.
   */
  async ensureQualificationReviewerNotification(
    dto: EnsureQualificationReviewerNotificationDto,
    idempotencyKey: string | undefined,
  ): Promise<{
    eventId: string;
    leadId: string;
    workflowRunId: string;
    reviewTaskId: string;
    qualificationId: string;
    idempotencyKey: string;
    notificationFound: boolean;
    notification: null | {
      id: string;
      userId: string;
      type: string;
      title: string;
      isRead: boolean;
      createdAt: Date;
    };
  }> {
    if (!idempotencyKey || idempotencyKey !== dto.workflowRunId) {
      throw new BadRequestException(
        'X-Idempotency-Key must equal workflowRunId for WF01 notification receipt',
      );
    }

    const workflowRun = await this.workflowRunsRepository.findOne({
      where: {
        id: dto.workflowRunId,
        leadId: dto.leadId,
        workflowName: 'lead-qualification',
      },
    });
    this.assertCallbackRunScope(workflowRun, dto.leadId, 'lead-qualification');

    if (workflowRun.status !== WorkflowStatus.SUCCESS) {
      throw new ConflictException(
        `Qualification WorkflowRun '${dto.workflowRunId}' has not completed successfully`,
      );
    }

    const qualification = dto.qualificationId
      ? await this.qualificationsRepository.findOne({
          where: {
            id: dto.qualificationId,
            leadId: dto.leadId,
            workflowRunId: dto.workflowRunId,
          },
        })
      : await this.qualificationsRepository.findOne({
          where: { leadId: dto.leadId, workflowRunId: dto.workflowRunId },
          order: { createdAt: 'DESC' },
        });

    if (!qualification) {
      throw new NotFoundException(
        'Qualification result not found for the requested workflow run',
      );
    }

    const reviewTask = await this.reviewTasksRepository.findOne({
      where: { id: dto.reviewTaskId, leadId: dto.leadId },
    });
    if (!reviewTask) {
      throw new NotFoundException(
        'ReviewTask not found for the requested Lead',
      );
    }

    const notification = await this.notificationsRepository.findOne({
      where: {
        reviewTaskId: reviewTask.id,
        leadId: dto.leadId,
        type: 'REVIEW_REQUIRED',
      },
      order: { createdAt: 'DESC' },
    });

    return {
      eventId: dto.eventId,
      leadId: dto.leadId,
      workflowRunId: dto.workflowRunId,
      reviewTaskId: reviewTask.id,
      qualificationId: qualification.id,
      idempotencyKey,
      notificationFound: Boolean(notification),
      notification: notification
        ? {
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            isRead: notification.isRead,
            createdAt: notification.createdAt,
          }
        : null,
    };
  }

  private async assertActiveQualificationRun(
    leadId: string,
    workflowRunId: string,
  ): Promise<void> {
    const workflowRun = await this.workflowRunsRepository.findOne({
      where: {
        id: workflowRunId,
        leadId,
        workflowName: 'lead-qualification',
      },
    });
    this.assertCallbackRunScope(workflowRun, leadId, 'lead-qualification');

    if (
      workflowRun.status !== WorkflowStatus.PENDING &&
      workflowRun.status !== WorkflowStatus.RUNNING
    ) {
      throw new ConflictException(
        `Qualification WorkflowRun '${workflowRunId}' is not active`,
      );
    }
  }

  async getQualificationsByLead(
    leadId: string,
    actor?: AuthenticatedUser,
  ): Promise<LeadQualification[]> {
    if (actor) {
      await this.assertLeadAccessById(leadId, actor);
    }
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
    actor?: AuthenticatedUser,
  ): Promise<LeadQualification | null> {
    if (actor) {
      await this.assertLeadAccessById(leadId, actor);
    }
    return this.qualificationsRepository.findOne({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: {
        workflowRun: true,
      },
    });
  }

  async getLatestEnrichment(
    leadId: string,
    actor?: AuthenticatedUser,
  ): Promise<LeadEnrichment | null> {
    if (actor) {
      await this.assertLeadAccessById(leadId, actor);
    }
    return this.enrichmentsRepository.findOne({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: {
        workflowRun: true,
      },
    });
  }

  async getEnrichmentsByLead(
    leadId: string,
    actor?: AuthenticatedUser,
  ): Promise<LeadEnrichment[]> {
    if (actor) {
      await this.assertLeadAccessById(leadId, actor);
    }
    return this.enrichmentsRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: {
        workflowRun: true,
      },
    });
  }

  async triggerEnrichment(
    leadId: string,
    dto?: TriggerEnrichmentDto,
    actor?: AuthenticatedUser,
  ): Promise<TriggerEnrichmentResponseDto> {
    const lead = await this.assertLeadAccessById(leadId, actor);

    const provider = dto?.provider ?? DEFAULT_ENRICHMENT_PROVIDER;

    // Normalize domain and website for RabbitMQ / n8n
    const website = lead.companyWebsite || undefined;
    let domain: string | undefined = undefined;
    if (website) {
      domain = website
        .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
        .split('/')[0]
        .split(':')[0]
        .trim();
    } else if (lead.email && lead.email.includes('@')) {
      domain = lead.email.split('@')[1].trim();
    }

    // 1. Create WorkflowRun
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 'lead-enrichment',
      leadId: lead.id,
      triggeredByUserId: actor?.id ?? null,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        leadId: lead.id,
        provider,
        email: lead.email,
        companyName: lead.companyName,
        companyWebsite: lead.companyWebsite,
        domain,
        website,
      },
    });
    let savedWorkflowRun: WorkflowRun;
    let savedEnrichment: LeadEnrichment;
    if (this.dataSource) {
      const persisted = await this.dataSource.transaction(async (manager) => {
        const run = await manager.save(WorkflowRun, workflowRun);
        const enrichment = this.enrichmentsRepository.create({
          leadId: lead.id,
          workflowRunId: run.id,
          provider,
          status: EnrichmentStatus.PENDING,
          enrichedAt: new Date(),
        });
        const saved = await manager.save(LeadEnrichment, enrichment);
        await this.rabbitmqService.enqueueEvent(
          manager,
          CRM_EVENTS.LEAD_ENRICHMENT_REQUESTED,
          {
            leadId: lead.id,
            workflowRunId: run.id,
            provider,
            email: lead.email ?? undefined,
            companyName: lead.companyName ?? undefined,
            companyWebsite: lead.companyWebsite ?? undefined,
            domain,
            website,
          },
        );
        return { run, enrichment: saved };
      });
      savedWorkflowRun = persisted.run;
      savedEnrichment = persisted.enrichment;
    } else {
      savedWorkflowRun = await this.workflowRunsRepository.save(workflowRun);
      const enrichment = this.enrichmentsRepository.create({
        leadId: lead.id,
        workflowRunId: savedWorkflowRun.id,
        provider,
        status: EnrichmentStatus.PENDING,
        enrichedAt: new Date(),
      });
      savedEnrichment = await this.enrichmentsRepository.save(enrichment);
      await this.rabbitmqService.publishLeadEnrichmentRequested({
        leadId: lead.id,
        workflowRunId: savedWorkflowRun.id,
        provider,
        email: lead.email ?? undefined,
        companyName: lead.companyName ?? undefined,
        companyWebsite: lead.companyWebsite ?? undefined,
        domain,
        website,
      });
    }
    this.logger.log(
      'Created WorkflowRun ' +
        savedWorkflowRun.id +
        ' and LeadEnrichment ' +
        savedEnrichment.id +
        ' for lead ' +
        lead.id,
    );
    return {
      message: 'Lead enrichment workflow triggered successfully',
      workflowRunId: savedWorkflowRun.id,
      enrichmentId: savedEnrichment.id,
      leadId: lead.id,
    };
  }

  /**
   * Handle the callback from n8n after enrichment completes:
   *  1. Perform idempotency check to avoid duplicate processing.
   *  2. Execute within DB Transaction:
   *     - Find or create LeadEnrichment record.
   *     - Update with enriched data & final status (SUCCESS/FAILED/PARTIAL).
   *     - Update Lead profile if SUCCESS or PARTIAL.
   *     - Update WorkflowRun to SUCCESS or FAILED.
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

    if (!dto.workflowRunId || !dto.workflowRunId.trim()) {
      throw new BadRequestException(
        'workflowRunId is required for enrichment callback correlation',
      );
    }

    const provider = dto.provider ?? DEFAULT_ENRICHMENT_PROVIDER;
    const companyIndustry = dto.industry ?? dto.companyIndustry ?? null;
    const contactJobTitle = dto.jobTitle ?? dto.contactJobTitle ?? null;
    const contactLinkedinUrl =
      dto.linkedInUrl ?? dto.contactLinkedinUrl ?? null;
    const companySize = dto.companySize ?? null;

    // ── Transaction Execution ───────────────────────────────────────────────
    const processEnrichment = async (repos: {
      leadRepo: Repository<Lead>;
      enrichmentRepo: Repository<LeadEnrichment>;
      workflowRunRepo: Repository<WorkflowRun>;
    }) => {
      // 1. Lock WorkflowRun with pessimistic_write
      const workflowRun = await repos.workflowRunRepo.findOne({
        where: { id: dto.workflowRunId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!workflowRun) {
        throw new NotFoundException(
          `WorkflowRun with ID '${dto.workflowRunId}' not found`,
        );
      }
      this.assertCallbackRunScope(workflowRun, dto.leadId, 'lead-enrichment');

      // 2. Lock Lead with pessimistic_write
      const lead = await repos.leadRepo.findOne({
        where: { id: dto.leadId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lead) {
        throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
      }

      // 3. Lock LeadEnrichment with pessimistic_write if existing
      const existingEnrichment = await repos.enrichmentRepo.findOne({
        where: { workflowRunId: dto.workflowRunId, leadId: dto.leadId },
        lock: { mode: 'pessimistic_write' },
      });

      // Compute target workflow status based on callback status
      let targetRunStatus: WorkflowStatus;
      if (dto.status === EnrichmentStatus.FAILED) {
        targetRunStatus = WorkflowStatus.FAILED;
      } else if (dto.status === EnrichmentStatus.PARTIAL) {
        targetRunStatus = WorkflowStatus.PARTIAL;
      } else {
        targetRunStatus = WorkflowStatus.SUCCESS;
      }

      // 4. Terminal State & Idempotency Check inside transaction
      if (this.isTerminalWorkflowStatus(workflowRun.status)) {
        if (
          existingEnrichment &&
          existingEnrichment.status !== EnrichmentStatus.PENDING &&
          workflowRun.status === targetRunStatus
        ) {
          // Idempotent duplicate: check for payload conflict
          if (targetRunStatus === WorkflowStatus.FAILED) {
            if (
              dto.errorMessage &&
              workflowRun.errorMessage &&
              dto.errorMessage.trim() !== workflowRun.errorMessage.trim()
            ) {
              throw new ConflictException(
                `Conflict: WorkflowRun '${workflowRun.id}' already failed with a conflicting error message`,
              );
            }
          } else {
            const recordedPayload = workflowRun.outputPayload as
              { provider?: string } | null | undefined;
            const recordedProvider: string | null =
              typeof recordedPayload?.provider === 'string'
                ? recordedPayload.provider
                : (existingEnrichment.provider ?? null);
            if (recordedProvider && provider && recordedProvider !== provider) {
              throw new ConflictException(
                `Conflict: WorkflowRun '${workflowRun.id}' already completed with provider '${recordedProvider}', conflicting with '${provider}'`,
              );
            }
          }

          this.logger.warn(
            `Idempotent duplicate callback detected for workflowRunId=${dto.workflowRunId}. Returning existing enrichment result.`,
          );
          return {
            enrichment: existingEnrichment,
            workflowRunUpdated: false,
          };
        }

        // Conflicting terminal transition
        throw new ConflictException(
          `Conflict: WorkflowRun '${workflowRun.id}' is already in terminal state '${workflowRun.status}' and cannot transition to '${targetRunStatus}'`,
        );
      }

      // 5. Active check: must be in PENDING or RUNNING
      this.assertCallbackRunActive(workflowRun);

      const target =
        existingEnrichment ??
        repos.enrichmentRepo.create({
          leadId: dto.leadId,
          workflowRunId: dto.workflowRunId,
          provider,
          status: EnrichmentStatus.PENDING,
          enrichedAt: new Date(),
        });

      // 2. Apply enriched data
      target.status = dto.status;
      target.provider = provider;
      target.externalRequestId = dto.externalRequestId ?? null;
      target.companyName = dto.companyName ?? null;
      target.companyWebsite = dto.companyWebsite ?? null;
      target.companyIndustry = companyIndustry;
      target.companySize = companySize;
      target.contactJobTitle = contactJobTitle;
      target.contactLinkedinUrl = contactLinkedinUrl;
      target.rawResponse = dto.rawResponse ?? null;
      target.errorMessage = dto.errorMessage ?? null;
      target.enrichedAt = new Date();

      const savedEnrichment = await repos.enrichmentRepo.save(target);
      this.logger.log(
        `Updated LeadEnrichment ${savedEnrichment.id} to status=${dto.status} for lead ${dto.leadId}`,
      );

      // 3. Update Lead with enriched fields if successful or partial (Lost Update Prevention)
      if (
        dto.status === EnrichmentStatus.SUCCESS ||
        dto.status === EnrichmentStatus.PARTIAL
      ) {
        const leadToUpdate =
          typeof repos.leadRepo.findOne === 'function'
            ? await repos.leadRepo.findOne({
                where: { id: dto.leadId },
              })
            : lead;
        if (leadToUpdate) {
          if (dto.companyName) leadToUpdate.companyName = dto.companyName;
          if (dto.companyWebsite)
            leadToUpdate.companyWebsite = dto.companyWebsite;
          if (companyIndustry) leadToUpdate.industry = companyIndustry;
          if (companySize !== null && companySize !== undefined) {
            leadToUpdate.companySize = companySize;
          }
          if (contactJobTitle) leadToUpdate.jobTitle = contactJobTitle;
          await repos.leadRepo.save(leadToUpdate);
          this.logger.log(
            `Updated Lead ${leadToUpdate.id} profile with enriched details`,
          );
        }
      }

      // 4. Update WorkflowRun
      let wfStatus = WorkflowStatus.SUCCESS;
      if (dto.status === EnrichmentStatus.FAILED) {
        wfStatus = WorkflowStatus.FAILED;
      } else if (dto.status === EnrichmentStatus.PARTIAL) {
        wfStatus = WorkflowStatus.PARTIAL;
      }
      workflowRun.status = wfStatus;
      workflowRun.finishedAt = new Date();
      workflowRun.errorMessage = dto.errorMessage ?? null;
      workflowRun.outputPayload = {
        enrichmentId: savedEnrichment.id,
        status: dto.status,
        provider,
        companyName: dto.companyName,
        companyWebsite: dto.companyWebsite,
        companyIndustry,
      };
      await repos.workflowRunRepo.save(workflowRun);

      if (dto.status === EnrichmentStatus.PARTIAL) {
        this.logger.warn(
          `Lead ${dto.leadId} enrichment partially succeeded (provider: ${provider}): ${dto.errorMessage ?? 'no details'}`,
        );
      } else if (dto.status === EnrichmentStatus.FAILED) {
        this.logger.error(
          `Lead ${dto.leadId} enrichment failed (provider: ${provider}): ${dto.errorMessage ?? 'unknown error'}`,
        );
      }

      return { enrichment: savedEnrichment, workflowRunUpdated: true };
    };

    let result: { enrichment: LeadEnrichment; workflowRunUpdated: boolean };

    if (this.dataSource) {
      result = await this.dataSource.transaction(async (manager) => {
        return processEnrichment({
          leadRepo: manager.getRepository(Lead),
          enrichmentRepo: manager.getRepository(LeadEnrichment),
          workflowRunRepo: manager.getRepository(WorkflowRun),
        });
      });
    } else {
      result = await processEnrichment({
        leadRepo: this.leadsRepository,
        enrichmentRepo: this.enrichmentsRepository,
        workflowRunRepo: this.workflowRunsRepository,
      });
    }

    // Auto-trigger Lead Scoring (UC04) after successful enrichment
    if (
      dto.status === EnrichmentStatus.SUCCESS ||
      dto.status === EnrichmentStatus.PARTIAL
    ) {
      try {
        await this.triggerScoring(dto.leadId);
        this.logger.log(
          `Auto-triggered AI lead scoring for lead ${dto.leadId} after successful enrichment`,
        );
      } catch (scoringErr: unknown) {
        this.logger.warn(
          `Failed to auto-trigger scoring for lead ${dto.leadId}: ${scoringErr instanceof Error ? scoringErr.message : String(scoringErr)}`,
        );
      }
    }

    return result;
  }

  /**
   * Mock external enrichment service for local development, n8n workflows, and testing.
   * Can simulate failure with `fail=true` to test retries and error handling.
   *
   * This endpoint returns fabricated data for arbitrary domains and emails. It is
   * therefore gated to development/test environments only. In any other environment
   * the request is rejected before any payload is generated.
   */
  mockEnrichment(query: {
    domain?: string;
    email?: string;
    provider?: string;
    fail?: string;
  }) {
    this.assertMockEndpointAllowed();

    if (query.fail === 'true' || query.domain === 'fail-retry.test') {
      throw new InternalServerErrorException(
        'Simulated external enrichment service failure (for retry testing)',
      );
    }

    const freeEmailProviders = new Set([
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'live.com',
      'icloud.com',
      'mail.com',
      'aol.com',
    ]);

    let domain = query.domain?.trim().toLowerCase();
    if (domain && freeEmailProviders.has(domain)) {
      domain = '';
    }
    if (!domain) {
      const emailDomain =
        query.email && query.email.includes('@')
          ? query.email.split('@')[1].trim().toLowerCase()
          : '';
      if (emailDomain && !freeEmailProviders.has(emailDomain)) {
        domain = emailDomain;
      } else {
        domain = 'enterprise.com';
      }
    }

    const namePart = domain ? domain.split('.')[0] : 'Enterprise';
    const capitalizedName =
      namePart.charAt(0).toUpperCase() + namePart.slice(1);

    const knownCompanies: Record<
      string,
      {
        name: string;
        website: string;
        industry: string;
        size: number;
        jobTitle: string;
        linkedinUrl: string;
      }
    > = {
      viettel: {
        name: 'Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel)',
        website: 'https://viettel.com.vn',
        industry: 'Viễn thông & Công nghệ thông tin',
        size: 50000,
        jobTitle: 'Trưởng ban Chuyển đổi số',
        linkedinUrl: 'https://linkedin.com/company/viettel-group',
      },
      fpt: {
        name: 'Tập đoàn FPT (FPT Corporation)',
        website: 'https://fpt.com.vn',
        industry: 'Công nghệ thông tin & Dịch vụ số',
        size: 70000,
        jobTitle: 'Giám đốc Công nghệ (CTO)',
        linkedinUrl: 'https://linkedin.com/company/fpt-corporation',
      },
      vng: {
        name: 'Công ty Cổ phần VNG',
        website: 'https://vng.com.vn',
        industry: 'Internet & Trò chơi trực tuyến',
        size: 4000,
        jobTitle: 'Giám đốc Kỹ thuật (VP of Engineering)',
        linkedinUrl: 'https://linkedin.com/company/vng-corporation',
      },
      vinfast: {
        name: 'Công ty TNHH Sản xuất và Kinh doanh VinFast',
        website: 'https://vinfastauto.com',
        industry: 'Sản xuất ô tô & Xe điện',
        size: 25000,
        jobTitle: 'Giám đốc Phát triển Chuỗi cung ứng',
        linkedinUrl: 'https://linkedin.com/company/vinfast-auto',
      },
      vingroup: {
        name: 'Tập đoàn Vingroup',
        website: 'https://vingroup.net',
        industry: 'Tập đoàn Đa ngành & Bất động sản',
        size: 60000,
        jobTitle: 'Trưởng ban Đầu tư & Chiến lược',
        linkedinUrl: 'https://linkedin.com/company/vingroup',
      },
      momo: {
        name: 'Công ty Cổ phần Dịch vụ Di động Trực tuyến (MoMo)',
        website: 'https://momo.vn',
        industry: 'Fintech & Thanh toán số',
        size: 2500,
        jobTitle: 'Trưởng phòng Phát triển Kinh doanh',
        linkedinUrl: 'https://linkedin.com/company/momo-wallet',
      },
      vnpt: {
        name: 'Tập đoàn Bưu chính Viễn thông Việt Nam (VNPT)',
        website: 'https://vnpt.com.vn',
        industry: 'Viễn thông & Chuyển đổi số',
        size: 40000,
        jobTitle: 'Kỹ sư Trưởng Giải pháp Doanh nghiệp',
        linkedinUrl: 'https://linkedin.com/company/vnpt',
      },
      vku: {
        name: 'Trường Đại học Công nghệ Thông tin và Truyền thông Việt - Hàn (VKU)',
        website: 'https://vku.udn.vn',
        industry: 'Giáo dục Đại học & Nghiên cứu CNTT',
        size: 500,
        jobTitle: 'Trưởng bộ môn / Giảng viên cao cấp',
        linkedinUrl: 'https://linkedin.com/school/vku-udn',
      },
      techcombank: {
        name: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)',
        website: 'https://techcombank.com',
        industry: 'Ngân hàng & Dịch vụ Tài chính',
        size: 13000,
        jobTitle: 'Trưởng phòng Khách hàng Doanh nghiệp',
        linkedinUrl: 'https://linkedin.com/company/techcombank',
      },
      vietcombank: {
        name: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)',
        website: 'https://vietcombank.com.vn',
        industry: 'Ngân hàng & Dịch vụ Tài chính',
        size: 23000,
        jobTitle: 'Giám đốc Quan hệ Khách hàng',
        linkedinUrl: 'https://linkedin.com/company/vietcombank',
      },
      shopee: {
        name: 'Shopee Vietnam',
        website: 'https://shopee.vn',
        industry: 'Thương mại Điện tử (E-Commerce)',
        size: 8000,
        jobTitle: 'Operations Team Lead',
        linkedinUrl: 'https://linkedin.com/company/shopee',
      },
      samsung: {
        name: 'Samsung Electronics Vietnam',
        website: 'https://samsung.com/vn',
        industry: 'Sản xuất Điện tử & Bán dẫn',
        size: 100000,
        jobTitle: 'Senior R&D Manager',
        linkedinUrl: 'https://linkedin.com/company/samsung-electronics',
      },
      google: {
        name: 'Google LLC',
        website: 'https://google.com',
        industry: 'Công nghệ & Điện toán đám mây',
        size: 180000,
        jobTitle: 'Senior Software Engineer',
        linkedinUrl: 'https://linkedin.com/company/google',
      },
      microsoft: {
        name: 'Microsoft Corporation',
        website: 'https://microsoft.com',
        industry: 'Phần mềm & Nền tảng Đám mây',
        size: 220000,
        jobTitle: 'Cloud Solution Architect',
        linkedinUrl: 'https://linkedin.com/company/microsoft',
      },
    };

    const normalizedKey = (namePart || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const matched = knownCompanies[normalizedKey];

    const company = matched
      ? {
          name: matched.name,
          website: matched.website,
          industry: matched.industry,
          size: matched.size,
        }
      : {
          name: `${capitalizedName} Solutions`,
          website: `https://${domain}`,
          industry:
            domain.endsWith('.edu') || domain.endsWith('.edu.vn')
              ? 'Giáo dục & Đào tạo'
              : domain.endsWith('.gov') || domain.endsWith('.gov.vn')
                ? 'Cơ quan Nhà nước'
                : 'Software & Technology',
          size: 150,
        };

    const contact = matched
      ? {
          jobTitle: matched.jobTitle,
          linkedinUrl: matched.linkedinUrl,
        }
      : {
          jobTitle: 'Director of Operations',
          linkedinUrl: `https://linkedin.com/company/${namePart}`,
        };

    return {
      provider: query.provider || 'mock',
      externalRequestId: `ext-${Date.now()}`,
      company,
      contact,
      rawResponse: {
        source: 'mock-enrichment-v1',
        query: { domain, email: query.email },
        timestamp: new Date().toISOString(),
        score: 0.95,
      },
    };
  }

  /**
   * Aggregates all available data for a lead across modules:
   *  1. Lead profile
   *  2. Latest Qualification
   *  3. Latest Enrichment (if available)
   *  4. Up to 20 recent Interactions
   *  5. Pre-extracted scoring features summary
   */
  async getScoringContext(
    leadId: string,
    actor?: AuthenticatedUser,
  ): Promise<{
    lead: Lead;
    qualification: LeadQualification | null;
    enrichment: LeadEnrichment | null;
    interactions: Interaction[];
    scoringFeatures: Record<string, any>;
  }> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }
    if (actor) {
      this.assertLeadAccess(lead, actor);
    }

    const [qualification, enrichment, interactions] = await Promise.all([
      this.getLatestQualification(leadId, actor),
      this.getLatestEnrichment(leadId, actor),
      this.interactionsRepository.find({
        where: { leadId },
        order: { occurredAt: 'DESC' },
        take: 20,
      }),
    ]);

    const hasValidEmail = Boolean(lead.email && lead.email.includes('@'));
    const companyName = enrichment?.companyName || lead.companyName || null;
    const companyWebsite =
      enrichment?.companyWebsite || lead.companyWebsite || null;
    const companySize = enrichment?.companySize ?? lead.companySize ?? null;
    const industry = enrichment?.companyIndustry || lead.industry || null;
    const jobTitle = enrichment?.contactJobTitle || lead.jobTitle || '';

    const isDecisionMaker = Boolean(
      jobTitle &&
      /c[etom]o|founder|co-founder|owner|president|vp|vice president|director|head|manager|lead/i.test(
        jobTitle,
      ),
    );

    const safeInteractions = Array.isArray(interactions) ? interactions : [];
    const now = Date.now();
    const recentInteractions = safeInteractions.filter((i) => {
      const occurred = new Date(i.occurredAt).getTime();
      return now - occurred <= 30 * 24 * 60 * 60 * 1000;
    });

    const scoringFeatures = {
      hasValidEmail,
      hasCompany: Boolean(companyName),
      hasWebsite: Boolean(companyWebsite),
      isDecisionMaker,
      companySize,
      industry,
      qualificationStatus: qualification?.status ?? null,
      qualificationConfidence: qualification?.confidence
        ? Number(qualification.confidence)
        : null,
      enrichmentStatus: enrichment?.status ?? null,
      totalInteractionsCount: safeInteractions.length,
      recentInteractionsCount: recentInteractions.length,
    };

    return {
      lead,
      qualification,
      enrichment,
      interactions: safeInteractions,
      scoringFeatures,
    };
  }

  /**
   * Deterministic / heuristic AI scoring model.
   * Useful for unit tests, offline evaluation, and mock simulation without external LLM API keys.
   */
  calculateMockScore(context: {
    lead: Lead;
    qualification: LeadQualification | null;
    enrichment: LeadEnrichment | null;
    interactions: Interaction[];
    scoringFeatures: Record<string, any>;
  }): {
    score: number;
    label: ScoreLabel;
    reason: string;
    scoringFeatures: Record<string, any>;
    modelProvider: string;
    modelName: string;
    modelVersion: string;
  } {
    const f = context.scoringFeatures;
    let score = 25; // baseline

    const breakdown: Record<string, number> = {
      baseline: 25,
      decisionMakerBonus: 0,
      companySizeBonus: 0,
      websiteBonus: 0,
      qualificationAdjustment: 0,
      engagementBonus: 0,
    };

    if (f.isDecisionMaker) {
      breakdown.decisionMakerBonus = 20;
      score += 20;
    }

    if (f.companySize && f.companySize >= 50) {
      breakdown.companySizeBonus = 15;
      score += 15;
    } else if (f.companySize && f.companySize >= 10) {
      breakdown.companySizeBonus = 10;
      score += 10;
    }

    if (f.hasWebsite) {
      breakdown.websiteBonus = 10;
      score += 10;
    }

    if (f.qualificationStatus === QualificationStatus.QUALIFIED) {
      const confBonus = Math.round((f.qualificationConfidence ?? 0.8) * 20);
      breakdown.qualificationAdjustment = confBonus;
      score += confBonus;
    } else if (f.qualificationStatus === QualificationStatus.DISQUALIFIED) {
      breakdown.qualificationAdjustment = -20;
      score -= 20;
    }

    const engagementPoints = Math.min(20, (f.recentInteractionsCount || 0) * 5);
    breakdown.engagementBonus = engagementPoints;
    score += engagementPoints;

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    const label = computeScoreLabel(finalScore);

    const reasons: string[] = [];
    if (label === ScoreLabel.HOT) {
      reasons.push('High intent, verified executive title, strong profile fit');
    } else if (label === ScoreLabel.WARM) {
      reasons.push('Moderate engagement and reasonable profile fit');
    } else {
      reasons.push('Low engagement or incomplete business profile');
    }

    return {
      score: finalScore,
      label,
      reason: reasons.join('; '),
      scoringFeatures: {
        ...f,
        scoreBreakdown: breakdown,
      },
      modelProvider: 'lead-scoring-engine',
      modelName: 'heuristic-evaluator-v1',
      modelVersion: '1.0.0',
    };
  }

  /**
   * Trigger the AI lead scoring workflow:
   *  1. Aggregate comprehensive scoring context (Lead, latest Qualification, latest Enrichment, Interactions).
   *  2. Create a WorkflowRun record with status PENDING.
   *  3. Publish `lead.scoring.requested` event to RabbitMQ for n8n.
   */
  async triggerScoring(
    leadId: string,
    dto?: TriggerScoringDto,
    actor?: AuthenticatedUser,
  ): Promise<TriggerScoringResponseDto> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }

    if (actor) {
      this.assertLeadAccess(lead, actor);
    }

    const context = await this.getScoringContext(leadId, actor);

    const leadData = {
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName,
      companyWebsite: lead.companyWebsite,
      jobTitle: lead.jobTitle,
      industry: lead.industry,
      companySize: lead.companySize,
      status: lead.status,
      notes: lead.notes,
    };

    const qualificationData = context.qualification
      ? {
          id: context.qualification.id,
          status: context.qualification.status,
          intent: context.qualification.intent,
          confidence: context.qualification.confidence,
          reason: context.qualification.reason,
          createdAt: context.qualification.createdAt,
        }
      : null;

    const enrichmentData = context.enrichment
      ? {
          id: context.enrichment.id,
          provider: context.enrichment.provider,
          status: context.enrichment.status,
          companyName: context.enrichment.companyName,
          companyWebsite: context.enrichment.companyWebsite,
          companyIndustry: context.enrichment.companyIndustry,
          companySize: context.enrichment.companySize,
          contactJobTitle: context.enrichment.contactJobTitle,
          contactLinkedinUrl: context.enrichment.contactLinkedinUrl,
          enrichedAt: context.enrichment.enrichedAt,
        }
      : null;

    const interactions = context.interactions.map((i) => ({
      id: i.id,
      type: i.type,
      channel: i.channel,
      subject: i.subject,
      content: i.content,
      occurredAt: i.occurredAt,
    }));

    // 1. Create WorkflowRun
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 'lead-scoring',
      leadId: lead.id,
      triggeredByUserId: actor?.id ?? null,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        leadId: lead.id,
        scoringFeatures: context.scoringFeatures,
        hasQualification: Boolean(context.qualification),
        hasEnrichment: Boolean(context.enrichment),
        interactionCount: context.interactions.length,
      },
    });
    const savedWorkflowRun = this.dataSource
      ? await this.dataSource.transaction(async (manager) => {
          const persistedRun = await manager.save(WorkflowRun, workflowRun);
          await this.rabbitmqService.enqueueEvent(
            manager,
            CRM_EVENTS.LEAD_SCORING_REQUESTED,
            {
              leadId: lead.id,
              workflowRunId: persistedRun.id,
              leadData,
              qualificationData,
              enrichmentData,
              interactions,
              scoringContext: {
                lead: leadData,
                qualification: qualificationData,
                enrichment: enrichmentData,
                interactions,
                scoringFeatures: context.scoringFeatures,
              },
            },
          );
          return persistedRun;
        })
      : await this.workflowRunsRepository.save(workflowRun);
    if (!this.dataSource) {
      await this.rabbitmqService.publishLeadScoringRequested({
        leadId: lead.id,
        workflowRunId: savedWorkflowRun.id,
        leadData,
        qualificationData,
        enrichmentData,
        interactions,
        scoringContext: {
          lead: leadData,
          qualification: qualificationData,
          enrichment: enrichmentData,
          interactions,
          scoringFeatures: context.scoringFeatures,
        },
      });
    }
    this.logger.log(
      'Created WorkflowRun ' +
        savedWorkflowRun.id +
        ' for lead scoring of lead ' +
        lead.id,
    );
    return {
      message: 'Lead scoring workflow triggered successfully',
      workflowRunId: savedWorkflowRun.id,
      leadId: lead.id,
    };
  }

  /**
   * Handle the callback from n8n after scoring completes:
   *  1. Perform idempotency check to avoid duplicate score creation.
   *  2. Execute within DB Transaction:
   *     - If FAILED, update WorkflowRun to FAILED.
   *     - If SUCCESS, insert new LeadScore (append-only history) and update WorkflowRun to SUCCESS.
   */
  async handleScoringCallback(dto: ScoringCallbackDto): Promise<{
    score: LeadScore | null;
    workflowRunUpdated: boolean;
  }> {
    const lead = await this.leadsRepository.findOne({
      where: { id: dto.leadId },
    });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
    }

    // ── Idempotency Check ───────────────────────────────────────────────────
    const existingRun = await this.workflowRunsRepository.findOne({
      where: {
        id: dto.workflowRunId,
        leadId: dto.leadId,
        workflowName: 'lead-scoring',
      },
    });
    this.assertCallbackRunScope(existingRun, lead.id, 'lead-scoring');
    const existingScore = await this.scoresRepository.findOne({
      where: { workflowRunId: dto.workflowRunId, leadId: dto.leadId },
    });

    if (this.isTerminalWorkflowStatus(existingRun.status)) {
      if (existingScore) {
        this.logger.warn(
          `Idempotent duplicate callback detected for workflowRunId=${dto.workflowRunId}. Returning existing score.`,
        );
        return { score: existingScore, workflowRunUpdated: false };
      }
    }
    this.assertCallbackRunActive(existingRun);

    const isFailure = dto.status === 'FAILED';

    const processScoring = async (repos: {
      scoresRepo: Repository<LeadScore>;
      workflowRunRepo: Repository<WorkflowRun>;
    }) => {
      const workflowRun = await repos.workflowRunRepo.findOne({
        where: {
          id: dto.workflowRunId,
          leadId: dto.leadId,
          workflowName: 'lead-scoring',
        },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertCallbackRunScope(workflowRun, lead.id, 'lead-scoring');

      if (this.isTerminalWorkflowStatus(workflowRun.status)) {
        const completedScore = await repos.scoresRepo.findOne({
          where: { workflowRunId: dto.workflowRunId, leadId: dto.leadId },
        });
        if (completedScore) {
          return { score: completedScore, workflowRunUpdated: false };
        }
      }
      this.assertCallbackRunActive(workflowRun);

      if (isFailure) {
        workflowRun.status = WorkflowStatus.FAILED;
        workflowRun.finishedAt = new Date();
        workflowRun.errorMessage =
          dto.errorMessage ?? 'Scoring workflow failed';
        await repos.workflowRunRepo.save(workflowRun);
        this.logger.error(
          `Lead ${dto.leadId} scoring failed: ${dto.errorMessage ?? 'unknown error'}`,
        );
        return { score: null, workflowRunUpdated: true };
      }

      // Success path:
      const rawScore = dto.score ?? 0;
      const normalizedScore = Math.max(
        0,
        Math.min(100, Math.round(Number(rawScore) * 100) / 100),
      );
      const label = dto.label || computeScoreLabel(normalizedScore);

      const modelInfoObj =
        typeof dto.modelInfo === 'object' && dto.modelInfo !== null
          ? dto.modelInfo
          : null;

      const modelProvider =
        dto.modelProvider ||
        (modelInfoObj && typeof modelInfoObj.provider === 'string'
          ? modelInfoObj.provider
          : null);
      const modelName =
        dto.modelName ||
        (modelInfoObj && typeof modelInfoObj.model === 'string'
          ? modelInfoObj.model
          : null);
      const modelVersion =
        dto.modelVersion ||
        (modelInfoObj && typeof modelInfoObj.version === 'string'
          ? modelInfoObj.version
          : null);

      const snapshotObj =
        typeof dto.inputOutputSnapshot === 'object' &&
        dto.inputOutputSnapshot !== null
          ? dto.inputOutputSnapshot
          : null;

      const inputSnapshot =
        dto.inputSnapshot ||
        (snapshotObj &&
        typeof snapshotObj.input === 'object' &&
        snapshotObj.input !== null
          ? (snapshotObj.input as Record<string, unknown>)
          : null);

      const outputSnapshot =
        dto.outputSnapshot ||
        (snapshotObj &&
        typeof snapshotObj.output === 'object' &&
        snapshotObj.output !== null
          ? (snapshotObj.output as Record<string, unknown>)
          : snapshotObj);

      // 1. Insert new LeadScore record (append-only history)
      const leadScore = repos.scoresRepo.create({
        leadId: dto.leadId,
        workflowRunId: dto.workflowRunId,
        score: normalizedScore,
        label,
        reason: dto.reason ?? null,
        modelProvider,
        modelName,
        modelVersion,
        scoringFeatures: dto.scoringFeatures ?? null,
        inputSnapshot: inputSnapshot ?? null,
        outputSnapshot: outputSnapshot ?? null,
      });

      const savedScore = await repos.scoresRepo.save(leadScore);
      this.logger.log(
        `Saved LeadScore ${savedScore.id} (score=${savedScore.score}, label=${savedScore.label}) for lead ${lead.id}`,
      );

      // 2. Update WorkflowRun
      workflowRun.status = WorkflowStatus.SUCCESS;
      workflowRun.finishedAt = new Date();
      workflowRun.outputPayload = {
        scoreId: savedScore.id,
        score: savedScore.score,
        label: savedScore.label,
        reason: savedScore.reason,
        scoringFeatures: savedScore.scoringFeatures,
      };
      await repos.workflowRunRepo.save(workflowRun);
      return { score: savedScore, workflowRunUpdated: true };
    };

    if (this.dataSource) {
      return await this.dataSource.transaction(async (manager) => {
        return processScoring({
          scoresRepo: manager.getRepository(LeadScore),
          workflowRunRepo: manager.getRepository(WorkflowRun),
        });
      });
    }

    return await processScoring({
      scoresRepo: this.scoresRepository,
      workflowRunRepo: this.workflowRunsRepository,
    });
  }

  async getScoresByLead(
    leadId: string,
    actor?: AuthenticatedUser,
  ): Promise<LeadScore[]> {
    if (actor) {
      await this.assertLeadAccessById(leadId, actor);
    }
    return this.scoresRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { workflowRun: true },
    });
  }

  async getLatestScore(
    leadId: string,
    actor?: AuthenticatedUser,
  ): Promise<LeadScore | null> {
    if (actor) {
      await this.assertLeadAccessById(leadId, actor);
    }
    return this.scoresRepository.findOne({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { workflowRun: true },
    });
  }

  private async assertLeadAccessById(
    leadId: string,
    actor?: AuthenticatedUser,
  ): Promise<Lead> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }
    if (actor) {
      this.assertLeadAccess(lead, actor);
    }
    return lead;
  }

  private assertLeadAccess(lead: Lead, actor: AuthenticatedUser): void {
    if (actor.role === UserRole.SALES && lead.ownerId !== actor.id) {
      // Match LeadsService: do not disclose another user's Lead existence.
      throw new NotFoundException(`Lead with ID '${lead.id}' not found`);
    }
  }

  /**
   * Fail-closed gate for mock enrichment endpoints.
   *
   * These endpoints fabricate company/contact data for arbitrary domains and
   * emails. They must never be reachable outside of local development and test
   * environments, otherwise they become an unauthenticated data oracle.
   */
  private assertMockEndpointAllowed(): void {
    const nodeEnv = (
      this.configService?.get<string>('NODE_ENV') ||
      process.env.NODE_ENV ||
      ''
    )
      .toLowerCase()
      .trim();

    if (nodeEnv && ['development', 'test'].includes(nodeEnv)) {
      return;
    }

    throw new ForbiddenException(
      'Mock enrichment endpoints are only available in development and test environments',
    );
  }

  private isTerminalWorkflowStatus(status: WorkflowStatus): boolean {
    return [
      WorkflowStatus.SUCCESS,
      WorkflowStatus.PARTIAL,
      WorkflowStatus.FAILED,
      WorkflowStatus.CANCELLED,
    ].includes(status);
  }

  private assertCallbackRunScope(
    workflowRun: WorkflowRun | null,
    leadId: string,
    workflowName: string,
  ): asserts workflowRun is WorkflowRun {
    if (
      !workflowRun ||
      workflowRun.leadId !== leadId ||
      workflowRun.workflowName !== workflowName
    ) {
      throw new NotFoundException(
        'WorkflowRun not found for callback resource',
      );
    }
  }

  private assertCallbackRunActive(workflowRun: WorkflowRun): void {
    if (
      workflowRun.status !== WorkflowStatus.PENDING &&
      workflowRun.status !== WorkflowStatus.RUNNING
    ) {
      throw new ConflictException(
        `WorkflowRun '${workflowRun.id}' is not active for callback processing`,
      );
    }
  }
}
