import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
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
import {
  EnrichmentStatus,
  QualificationStatus,
  ScoreLabel,
} from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ReviewStatus } from '../review/enums/review.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import {
  computeScoreLabel,
  EnrichmentCallbackDto,
  QualificationCallbackDto,
  ScoringCallbackDto,
  TriggerEnrichmentDto,
  TriggerQualificationDto,
  TriggerScoringDto,
} from './dto/index.js';

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

      // Check if a pending ReviewTask already exists for this lead (Idempotency Guard)
      const existingPendingTask = await this.reviewTasksRepository.findOne({
        where: {
          leadId: lead.id,
          status: ReviewStatus.PENDING,
        },
      });

      if (!existingPendingTask) {
        const reviewTask = this.reviewTasksRepository.create({
          leadId: lead.id,
          workflowRunId: workflowRun?.id ?? null,
          assignedTo: lead.ownerId ?? null,
          status: ReviewStatus.PENDING,
          reason,
        });

        const savedReviewTask =
          await this.reviewTasksRepository.save(reviewTask);
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

  async getLatestEnrichment(leadId: string): Promise<LeadEnrichment | null> {
    return this.enrichmentsRepository.findOne({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: {
        workflowRun: true,
      },
    });
  }

  async getEnrichmentsByLead(leadId: string): Promise<LeadEnrichment[]> {
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
      triggeredByUserId: dto?.userId ?? null,
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
      domain,
      website,
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

    const provider = dto.provider ?? DEFAULT_ENRICHMENT_PROVIDER;
    const companyIndustry = dto.industry ?? dto.companyIndustry ?? null;
    const contactJobTitle = dto.jobTitle ?? dto.contactJobTitle ?? null;
    const contactLinkedinUrl =
      dto.linkedInUrl ?? dto.contactLinkedinUrl ?? null;
    const companySize = dto.companySize ?? null;

    // ── Idempotency Check ───────────────────────────────────────────────────
    if (dto.workflowRunId) {
      const existingRun = await this.workflowRunsRepository.findOne({
        where: { id: dto.workflowRunId },
      });
      const existingEnrichment = await this.enrichmentsRepository.findOne({
        where: { workflowRunId: dto.workflowRunId, leadId: dto.leadId },
      });

      if (
        existingEnrichment &&
        existingEnrichment.status !== EnrichmentStatus.PENDING &&
        existingRun &&
        (existingRun.status === WorkflowStatus.SUCCESS ||
          existingRun.status === WorkflowStatus.FAILED)
      ) {
        this.logger.warn(
          `Idempotent duplicate callback detected for workflowRunId=${dto.workflowRunId}. Returning existing enrichment result.`,
        );
        return {
          enrichment: existingEnrichment,
          workflowRunUpdated: false,
        };
      }
    }

    // ── Transaction Execution ───────────────────────────────────────────────
    const processEnrichment = async (repos: {
      leadRepo: Repository<Lead>;
      enrichmentRepo: Repository<LeadEnrichment>;
      workflowRunRepo: Repository<WorkflowRun>;
    }) => {
      // 1. Find the pending enrichment record
      const enrichment = dto.workflowRunId
        ? await repos.enrichmentRepo.findOne({
            where: { workflowRunId: dto.workflowRunId, leadId: dto.leadId },
          })
        : await repos.enrichmentRepo.findOne({
            where: { leadId: dto.leadId, status: EnrichmentStatus.PENDING },
            order: { createdAt: 'DESC' },
          });

      const target =
        enrichment ??
        repos.enrichmentRepo.create({
          leadId: dto.leadId,
          workflowRunId: dto.workflowRunId ?? null,
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
      let workflowRunUpdated = false;
      const workflowRunId =
        dto.workflowRunId ?? savedEnrichment.workflowRunId ?? null;

      if (workflowRunId) {
        const workflowRun = await repos.workflowRunRepo.findOne({
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
            provider,
            companyName: dto.companyName,
            companyWebsite: dto.companyWebsite,
            companyIndustry,
          };
          await repos.workflowRunRepo.save(workflowRun);
          workflowRunUpdated = true;
        }
      }

      if (dto.status === EnrichmentStatus.PARTIAL) {
        this.logger.warn(
          `Lead ${dto.leadId} enrichment partially succeeded (provider: ${provider}): ${dto.errorMessage ?? 'no details'}`,
        );
      } else if (dto.status === EnrichmentStatus.FAILED) {
        this.logger.error(
          `Lead ${dto.leadId} enrichment failed (provider: ${provider}): ${dto.errorMessage ?? 'unknown error'}`,
        );
      }

      return { enrichment: savedEnrichment, workflowRunUpdated };
    };

    if (this.dataSource) {
      return await this.dataSource.transaction(async (manager) => {
        return processEnrichment({
          leadRepo: manager.getRepository(Lead),
          enrichmentRepo: manager.getRepository(LeadEnrichment),
          workflowRunRepo: manager.getRepository(WorkflowRun),
        });
      });
    }

    return await processEnrichment({
      leadRepo: this.leadsRepository,
      enrichmentRepo: this.enrichmentsRepository,
      workflowRunRepo: this.workflowRunsRepository,
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

  /**
   * Aggregates all available data for a lead across modules:
   *  1. Lead profile
   *  2. Latest Qualification
   *  3. Latest Enrichment (if available)
   *  4. Up to 20 recent Interactions
   *  5. Pre-extracted scoring features summary
   */
  async getScoringContext(leadId: string): Promise<{
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

    const [qualification, enrichment, interactions] = await Promise.all([
      this.getLatestQualification(leadId),
      this.getLatestEnrichment(leadId),
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

    const now = Date.now();
    const recentInteractions = interactions.filter((i) => {
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
      totalInteractionsCount: interactions.length,
      recentInteractionsCount: recentInteractions.length,
    };

    return {
      lead,
      qualification,
      enrichment,
      interactions,
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
  ): Promise<{ message: string; workflowRunId: string; leadId: string }> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }

    const context = await this.getScoringContext(leadId);

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
      triggeredByUserId: dto?.userId ?? null,
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
    const savedWorkflowRun =
      await this.workflowRunsRepository.save(workflowRun);
    this.logger.log(
      `Created WorkflowRun ${savedWorkflowRun.id} for lead scoring of lead ${lead.id}`,
    );

    // 2. Publish event to RabbitMQ
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
    if (dto.workflowRunId) {
      const existingRun = await this.workflowRunsRepository.findOne({
        where: { id: dto.workflowRunId },
      });
      const existingScore = await this.scoresRepository.findOne({
        where: { workflowRunId: dto.workflowRunId },
      });

      if (
        existingScore &&
        existingRun &&
        (existingRun.status === WorkflowStatus.SUCCESS ||
          existingRun.status === WorkflowStatus.FAILED)
      ) {
        this.logger.warn(
          `Idempotent duplicate callback detected for workflowRunId=${dto.workflowRunId}. Returning existing score.`,
        );
        return { score: existingScore, workflowRunUpdated: false };
      }
    }

    const isFailure = dto.status === 'FAILED';

    const processScoring = async (repos: {
      scoresRepo: Repository<LeadScore>;
      workflowRunRepo: Repository<WorkflowRun>;
    }) => {
      let workflowRunUpdated = false;
      const workflowRun = dto.workflowRunId
        ? await repos.workflowRunRepo.findOne({
            where: { id: dto.workflowRunId },
          })
        : await repos.workflowRunRepo.findOne({
            where: {
              leadId: dto.leadId,
              workflowName: 'lead-scoring',
              status: WorkflowStatus.PENDING,
            },
            order: { createdAt: 'DESC' },
          });

      if (isFailure) {
        if (workflowRun) {
          workflowRun.status = WorkflowStatus.FAILED;
          workflowRun.finishedAt = new Date();
          workflowRun.errorMessage =
            dto.errorMessage ?? 'Scoring workflow failed';
          await repos.workflowRunRepo.save(workflowRun);
          workflowRunUpdated = true;
        }
        this.logger.error(
          `Lead ${dto.leadId} scoring failed: ${dto.errorMessage ?? 'unknown error'}`,
        );
        return { score: null, workflowRunUpdated };
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
        workflowRunId: dto.workflowRunId ?? null,
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
      if (workflowRun) {
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
        workflowRunUpdated = true;
      }

      return { score: savedScore, workflowRunUpdated };
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

  async getScoresByLead(leadId: string): Promise<LeadScore[]> {
    return this.scoresRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { workflowRun: true },
    });
  }

  async getLatestScore(leadId: string): Promise<LeadScore | null> {
    return this.scoresRepository.findOne({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: { workflowRun: true },
    });
  }
}
