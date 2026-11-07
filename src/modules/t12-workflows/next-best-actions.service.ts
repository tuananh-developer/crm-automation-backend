import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Lead } from '../leads/entities/lead.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { LeadQualification } from '../lead-intelligence/entities/lead-qualification.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { CustomerSegment } from '../customers/entities/customer-segment.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ReviewTask } from '../review/entities/review-task.entity.js';
import { ReviewStatus } from '../review/enums/review.enum.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { NextBestActionRecommendation } from './entities/next-best-action-recommendation.entity.js';
import { WorkflowExecutionClaimsService } from './workflow-execution-claims.service.js';
import {
  NextBestActionCallbackDto,
  NextBestActionReviewDto,
  StartNextBestActionDto,
  ClaimNextBestActionContextDto,
} from './dto/index.js';
import { N8nWorkflowDispatchService } from './n8n-workflow-dispatch.service.js';
import { hasSamePayload, isPostgresUniqueViolation } from '../../common/utils/idempotency.util.js';

export const WF10_NAME = 'T12-WF10_NEXT_BEST_ACTION';

const ALLOWED_ACTIONS = [
  {
    actionCode: 'REVIEW_LEAD_PROFILE',
    label: 'Review CRM profile completeness',
    description: 'Review missing or inconsistent CRM profile fields.',
    requiresApproval: true,
  },
  {
    actionCode: 'SCHEDULE_DISCOVERY_CALL',
    label: 'Recommend a discovery call',
    description:
      'Prepare a discovery call recommendation for the assigned owner.',
    requiresApproval: true,
  },
  {
    actionCode: 'PREPARE_FOLLOW_UP',
    label: 'Prepare a follow-up',
    description: 'Prepare a follow-up proposal; do not send automatically.',
    requiresApproval: true,
  },
  {
    actionCode: 'REQUEST_HUMAN_REVIEW',
    label: 'Request human review',
    description:
      'Ask the record owner to review uncertain or conflicting evidence.',
    requiresApproval: true,
  },
  {
    actionCode: 'REVIEW_ACCOUNT_CONTEXT',
    label: 'Review account context',
    description: 'Review engagement, segment and follow-up context.',
    requiresApproval: false,
  },
] as const;

@Injectable()
export class NextBestActionsService {
  constructor(
    @InjectRepository(WorkflowRun)
    private readonly workflowRuns: Repository<WorkflowRun>,
    @InjectRepository(Lead)
    private readonly leads: Repository<Lead>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(Interaction)
    private readonly interactions: Repository<Interaction>,
    @InjectRepository(LeadQualification)
    private readonly qualifications: Repository<LeadQualification>,
    @InjectRepository(LeadScore)
    private readonly scores: Repository<LeadScore>,
    @InjectRepository(LeadFollowUpEnrollment)
    private readonly enrollments: Repository<LeadFollowUpEnrollment>,
    @InjectRepository(CustomerSegment)
    private readonly customerSegments: Repository<CustomerSegment>,
    @InjectRepository(NextBestActionRecommendation)
    private readonly recommendations: Repository<NextBestActionRecommendation>,
    @InjectRepository(ReviewTask)
    private readonly reviewTasks: Repository<ReviewTask>,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly dispatcher: N8nWorkflowDispatchService,
    private readonly executionClaims: WorkflowExecutionClaimsService,
  ) {}

  private assertIdempotencyKey(key?: string): string {
    if (!key || key.length < 8 || key.length > 180) {
      throw new BadRequestException(
        'Idempotency-Key header is required (8..180 characters)',
      );
    }
    return key;
  }

  private async assertEntityAccess(
    dto: StartNextBestActionDto,
    actor: AuthenticatedUser,
  ): Promise<{ lead?: Lead; customer?: Customer }> {
    if (dto.entityType === 'Lead') {
      const lead = await this.leads.findOne({ where: { id: dto.entityId } });
      if (!lead) throw new NotFoundException('Lead not found');
      if (actor.role !== UserRole.ADMIN && lead.ownerId !== actor.id) {
        throw new NotFoundException('Lead not found');
      }
      return { lead };
    }
    const customer = await this.customers.findOne({
      where: { id: dto.entityId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (actor.role !== UserRole.ADMIN && customer.createdBy !== actor.id) {
      throw new NotFoundException('Customer not found');
    }
    return { customer };
  }

  async request(
    dto: StartNextBestActionDto,
    actor: AuthenticatedUser,
    rawIdempotencyKey?: string,
  ) {
    const clientKey = this.assertIdempotencyKey(rawIdempotencyKey);
    await this.assertEntityAccess(dto, actor);
    const idempotencyKey = 'WF10:' + actor.id + ':' + clientKey;
    const inputPayload = { entityType: dto.entityType, entityId: dto.entityId };
    const reuseExisting = (existing: WorkflowRun) => {
      if (existing.workflowName !== WF10_NAME) {
        throw new ConflictException(
          'Idempotency key is already used by another workflow',
        );
      }
      if (!hasSamePayload(existing.inputPayload, inputPayload)) {
        throw new ConflictException(
          'Idempotency key was already used with a different workflow payload',
        );
      }
      return {
        workflowRunId: existing.id,
        status: existing.status,
        reused: true,
      };
    };

    const existing = await this.workflowRuns.findOne({
      where: { idempotencyKey },
    });
    if (existing) return reuseExisting(existing);

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const runRepository = manager.getRepository(WorkflowRun);
        const run = await runRepository.save(
          runRepository.create({
            workflowName: WF10_NAME,
            leadId: dto.entityType === 'Lead' ? dto.entityId : null,
            customerId: dto.entityType === 'Customer' ? dto.entityId : null,
            triggeredByUserId: actor.id,
            idempotencyKey,
            status: WorkflowStatus.PENDING,
            inputPayload,
            outputPayload: null,
            errorMessage: null,
            startedAt: new Date(),
            finishedAt: null,
          }),
        );

        await this.dispatcher.enqueue(
          manager,
          'N8N_WF10_WEBHOOK_URL',
          'internal/t12-wf10-next-best-action',
          {
            entityType: dto.entityType,
            entityId: dto.entityId,
            workflowRunId: run.id,
            requestedBy: actor.id,
            requestedAt: new Date().toISOString(),
          },
        );
        return run;
      });

      return {
        workflowRunId: saved.id,
        status: saved.status,
        reused: false,
      };
    } catch (error) {
      if (!isPostgresUniqueViolation(error)) throw error;
      const concurrent = await this.workflowRuns.findOne({
        where: { idempotencyKey },
      });
      if (!concurrent) throw error;
      return reuseExisting(concurrent);
    }
  }

  private async getScopedRun(
    entityType: 'Lead' | 'Customer',
    entityId: string,
    workflowRunId: string,
    allowTerminal = false,
  ): Promise<WorkflowRun> {
    const run = await this.workflowRuns.findOne({
      where: {
        id: workflowRunId,
        workflowName: WF10_NAME,
        ...(entityType === 'Lead'
          ? { leadId: entityId }
          : { customerId: entityId }),
      },
    });
    if (!run)
      throw new NotFoundException(
        'Next Best Action WorkflowRun not found for this entity',
      );
    if (
      !allowTerminal &&
      ![WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(run.status)
    ) {
      throw new ConflictException('Next Best Action WorkflowRun is not active');
    }
    return run;
  }

  async getEntityProfile(
    entityType: 'Lead' | 'Customer',
    entityId: string,
    workflowRunId: string,
  ) {
    await this.getScopedRun(entityType, entityId, workflowRunId);
    if (entityType === 'Lead') {
      const lead = await this.leads.findOne({
        where: { id: entityId },
        select: {
          id: true,
          companyName: true,
          companyWebsite: true,
          jobTitle: true,
          companySize: true,
          industry: true,
          status: true,
        },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      return { data: { ...lead, entityType } };
    }
    // WF10 ranks business actions from company and engagement context only.
    // Contact names, email addresses and phone numbers are not needed in n8n.
    const customer = await this.customers.findOne({
      where: { id: entityId },
      select: {
        id: true,
        companyName: true,
        companyWebsite: true,
        jobTitle: true,
        companySize: true,
        industry: true,
        status: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return { data: { ...customer, entityType } };
  }

  async claimAndGetEntityContext(dto: ClaimNextBestActionContextDto) {
    const context = await this.getEntityProfile(
      dto.entityType,
      dto.entityId,
      dto.workflowRunId,
    );
    const claim = await this.executionClaims.claim({
      workflowRunId: dto.workflowRunId,
      workflowName: WF10_NAME,
      n8nExecutionId: dto.n8nExecutionId,
    });
    if (!claim.claimed) {
      throw new ConflictException(
        'WorkflowRun is already claimed by another n8n execution or is no longer active',
      );
    }
    return context;
  }

  async getIntelligenceContext(
    entityType: 'Lead' | 'Customer',
    entityId: string,
    workflowRunId: string,
  ) {
    await this.getScopedRun(entityType, entityId, workflowRunId);
    if (entityType === 'Lead') {
      const [qualification, score] = await Promise.all([
        this.qualifications.findOne({
          where: { leadId: entityId },
          order: { createdAt: 'DESC' },
        }),
        this.scores.findOne({
          where: { leadId: entityId },
          order: { createdAt: 'DESC' },
        }),
      ]);
      return {
        qualificationId: qualification?.id ?? null,
        qualification: qualification
          ? {
              status: qualification.status,
              confidence: qualification.confidence,
              intent: qualification.intent,
              reason: qualification.reason,
              createdAt: qualification.createdAt,
            }
          : null,
        scoreId: score?.id ?? null,
        score: score
          ? {
              score: score.score,
              label: score.label,
              reason: score.reason,
              createdAt: score.createdAt,
            }
          : null,
      };
    }

    const linkedLeads = await this.leads.find({
      where: { convertedCustomerId: entityId },
      select: { id: true },
    });
    const leadIds = linkedLeads.map((lead) => lead.id);
    if (!leadIds.length)
      return {
        qualificationId: null,
        qualification: null,
        scoreId: null,
        score: null,
      };
    const [qualification, score] = await Promise.all([
      this.qualifications.findOne({
        where: { leadId: In(leadIds) },
        order: { createdAt: 'DESC' },
      }),
      this.scores.findOne({
        where: { leadId: In(leadIds) },
        order: { createdAt: 'DESC' },
      }),
    ]);
    return {
      qualificationId: qualification?.id ?? null,
      qualification: qualification
        ? {
            status: qualification.status,
            confidence: qualification.confidence,
            intent: qualification.intent,
            reason: qualification.reason,
            createdAt: qualification.createdAt,
          }
        : null,
      scoreId: score?.id ?? null,
      score: score
        ? {
            score: score.score,
            label: score.label,
            reason: score.reason,
            createdAt: score.createdAt,
          }
        : null,
    };
  }

  async getInteractionHistory(
    entityType: 'Lead' | 'Customer',
    entityId: string,
    workflowRunId: string,
  ) {
    await this.getScopedRun(entityType, entityId, workflowRunId);
    let leadIds = [entityId];
    if (entityType === 'Customer') {
      const linkedLeads = await this.leads.find({
        where: { convertedCustomerId: entityId },
        select: { id: true },
      });
      leadIds = linkedLeads.map((lead) => lead.id);
    }
    if (!leadIds.length) return { items: [] };
    // WF10 uses interaction identity/type/time as evidence references only.
    // Do not copy message subjects or free-form contents into n8n execution data.
    const records = await this.interactions.find({
      where: { leadId: In(leadIds) },
      select: {
        id: true,
        type: true,
        channel: true,
        occurredAt: true,
      },
      order: { occurredAt: 'DESC' },
      take: 30,
    });
    return {
      items: records.map((item) => ({
        id: item.id,
        type: item.type,
        channel: item.channel,
        occurredAt: item.occurredAt,
      })),
    };
  }

  async getFollowUpSegmentContext(
    entityType: 'Lead' | 'Customer',
    entityId: string,
    workflowRunId: string,
    n8nExecutionId: string,
  ) {
    await this.getScopedRun(entityType, entityId, workflowRunId);
    await this.executionClaims.heartbeat({
      workflowRunId,
      workflowName: WF10_NAME,
      n8nExecutionId,
    });
    let followUps: LeadFollowUpEnrollment[] = [];
    let segments: CustomerSegment[] = [];
    if (entityType === 'Lead') {
      followUps = await this.enrollments.find({
        where: { leadId: entityId },
        relations: { sequence: true },
        order: { createdAt: 'DESC' },
        take: 10,
      });
    } else {
      segments = await this.customerSegments.find({
        where: { customerId: entityId },
        relations: { segment: true },
        order: { assignedAt: 'DESC' },
        take: 20,
      });
    }
    const allowedActions = ALLOWED_ACTIONS.map((item) => ({
      ...item,
      evidenceIds: [] as string[],
    }));
    return {
      followUps: followUps.map((item) => ({
        id: item.id,
        status: item.status,
        sequenceId: item.sequenceId,
        sequenceName: item.sequence?.name ?? null,
        startedAt: item.startedAt,
      })),
      segments: segments.map((item) => ({
        segmentId: item.segmentId,
        segmentName: item.segment?.name ?? null,
        assignmentType: item.assignmentType,
        assignedAt: item.assignedAt,
      })),
      allowedActions,
    };
  }

  async saveRecommendation(dto: NextBestActionCallbackDto) {
    await this.getScopedRun(
      dto.entityType,
      dto.entityId,
      dto.workflowRunId,
      true,
    );

    const canonicalRecommendations: NextBestActionCallbackDto['recommendations'] =
      [];
    for (const recommendation of dto.recommendations) {
      const policy = ALLOWED_ACTIONS.find(
        (item) => item.actionCode === recommendation.actionCode,
      );
      if (!policy) {
        throw new BadRequestException(
          `Action '${recommendation.actionCode}' is not allowed`,
        );
      }
      if (recommendation.evidenceIds.length > 0) {
        const validIds = await this.getValidEvidenceIds(
          dto.entityType,
          dto.entityId,
          recommendation.evidenceIds,
        );
        if (validIds.size !== recommendation.evidenceIds.length) {
          throw new BadRequestException(
            'Recommendation contains evidence outside the authorized entity context',
          );
        }
      }
      canonicalRecommendations.push({
        ...recommendation,
        requiresApproval:
          policy.requiresApproval || recommendation.confidence < 0.7,
      });
    }

    const requiresHumanApproval = canonicalRecommendations.some(
      (item) => item.requiresApproval,
    );
    const canonicalPayload = canonicalRecommendations as unknown as Array<
      Record<string, unknown>
    >;

    return this.dataSource.transaction(async (manager) => {
      const runRepository = manager.getRepository(WorkflowRun);
      const recommendationRepository = manager.getRepository(
        NextBestActionRecommendation,
      );
      const run = await runRepository.findOne({
        where: {
          id: dto.workflowRunId,
          workflowName: WF10_NAME,
          ...(dto.entityType === 'Lead'
            ? { leadId: dto.entityId }
            : { customerId: dto.entityId }),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) {
        throw new NotFoundException(
          'Next Best Action WorkflowRun not found for this entity',
        );
      }

      const now = new Date();
      const ownsActiveLease =
        run.n8nExecutionId === dto.n8nExecutionId &&
        Boolean(run.claimExpiresAt) &&
        run.claimExpiresAt!.getTime() > now.getTime();
      const existing = await recommendationRepository.findOne({
        where: { workflowRunId: run.id },
      });
      if (existing) {
        if (run.n8nExecutionId !== dto.n8nExecutionId) {
          throw new ConflictException('Workflow execution no longer owns this recommendation');
        }
        if (
          existing.entityType !== dto.entityType ||
          existing.entityId !== dto.entityId ||
          !hasSamePayload(existing.recommendations, canonicalPayload)
        ) {
          throw new ConflictException(
            'WorkflowRun already has a different Next Best Action recommendation',
          );
        }
        if (run.status !== WorkflowStatus.SUCCESS && !ownsActiveLease) {
          throw new ConflictException('Workflow execution claim has expired or is no longer active');
        }
        return {
          id: existing.id,
          recommendationId: existing.id,
          workflowRunId: run.id,
          status: existing.status,
          requiresHumanApproval: existing.requiresHumanApproval,
          reused: true,
        };
      }

      if (
        !ownsActiveLease ||
        ![WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(run.status)
      ) {
        throw new ConflictException(
          'Cannot persist a recommendation for a terminal WorkflowRun',
        );
      }

      const saved = await recommendationRepository.save(
        recommendationRepository.create({
          workflowRunId: run.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
          recommendations: canonicalPayload,
          requiresHumanApproval,
          status: requiresHumanApproval ? 'PENDING_APPROVAL' : 'RECOMMENDED',
          reviewTaskId: null,
        }),
      );
      // Keep the execution claim alive until the approval/notification
      // gate has also completed. The workflow's final callback releases it.
      run.status = requiresHumanApproval
        ? WorkflowStatus.RUNNING
        : WorkflowStatus.SUCCESS;
      if (!requiresHumanApproval) {
        run.claimExpiresAt = null;
        run.finishedAt = new Date();
      } else {
        run.finishedAt = null;
      }
      run.outputPayload = {
        ...(run.outputPayload ?? {}),
        recommendationId: saved.id,
        recommendationCount: canonicalRecommendations.length,
        requiresHumanApproval,
      };
      await runRepository.save(run);

      return {
        id: saved.id,
        recommendationId: saved.id,
        workflowRunId: run.id,
        status: saved.status,
        requiresHumanApproval,
        reused: false,
      };
    });
  }

  async getRecommendation(recommendationId: string, actor: AuthenticatedUser) {
    const recommendation = await this.recommendations.findOne({
      where: { id: recommendationId },
    });
    if (!recommendation)
      throw new NotFoundException('Next Best Action recommendation not found');
    if (recommendation.entityType === 'Lead') {
      const lead = await this.leads.findOne({
        where: { id: recommendation.entityId },
        select: { id: true, ownerId: true },
      });
      if (!lead || (actor.role !== UserRole.ADMIN && lead.ownerId !== actor.id))
        throw new NotFoundException('Recommendation not found');
    } else {
      const customer = await this.customers.findOne({
        where: { id: recommendation.entityId },
        select: { id: true, createdBy: true },
      });
      if (
        !customer ||
        (actor.role !== UserRole.ADMIN && customer.createdBy !== actor.id)
      )
        throw new NotFoundException('Recommendation not found');
    }
    return recommendation;
  }

  private async getValidEvidenceIds(
    entityType: 'Lead' | 'Customer',
    entityId: string,
    ids: string[],
  ): Promise<Set<string>> {
    const valid = new Set<string>();
    const leadIds =
      entityType === 'Lead'
        ? [entityId]
        : (
            await this.leads.find({
              where: { convertedCustomerId: entityId },
              select: { id: true },
            })
          ).map((item) => item.id);
    const interactions = leadIds.length
      ? await this.interactions.find({
          where: { id: In(ids), leadId: In(leadIds) },
          select: { id: true },
        })
      : [];
    interactions.forEach((item) => valid.add(item.id));
    const [qualifications, scores] = await Promise.all([
      leadIds.length
        ? this.qualifications.find({
            where: { id: In(ids), leadId: In(leadIds) },
            select: { id: true },
          })
        : [],
      leadIds.length
        ? this.scores.find({
            where: { id: In(ids), leadId: In(leadIds) },
            select: { id: true },
          })
        : [],
    ]);
    qualifications.forEach((item) => valid.add(item.id));
    scores.forEach((item) => valid.add(item.id));
    return valid;
  }

  async createReviewOrNotification(
    dto: NextBestActionReviewDto,
    idempotencyKey?: string,
  ) {
    if (
      idempotencyKey !== dto.idempotencyKey ||
      dto.idempotencyKey !== dto.workflowRunId
    ) {
      throw new BadRequestException('Idempotency-Key must equal workflowRunId');
    }
    await this.getScopedRun(
      dto.entityType,
      dto.entityId,
      dto.workflowRunId,
      true,
    );
    const recommendation = await this.recommendations.findOne({
      where: {
        id: dto.recommendationId,
        workflowRunId: dto.workflowRunId,
        entityId: dto.entityId,
        entityType: dto.entityType,
      },
    });
    if (!recommendation) {
      throw new NotFoundException(
        'Recommendation not found for this WorkflowRun',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(WorkflowRun);
      const recommendationRepo = manager.getRepository(
        NextBestActionRecommendation,
      );
      const notificationRepo = manager.getRepository(Notification);
      const reviewTaskRepo = manager.getRepository(ReviewTask);
      const run = await runRepo.findOne({
        where: { id: dto.workflowRunId, workflowName: WF10_NAME },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) throw new NotFoundException('WorkflowRun not found');
      const current = await recommendationRepo.findOne({
        where: { id: recommendation.id },
      });
      if (!current) throw new NotFoundException('Recommendation not found');

      const ownsLiveLease =
        run.n8nExecutionId === dto.n8nExecutionId &&
        [WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(run.status) &&
        Boolean(run.claimExpiresAt) &&
        run.claimExpiresAt!.getTime() > Date.now();
      const completedReplay =
        run.n8nExecutionId === dto.n8nExecutionId &&
        [WorkflowStatus.SUCCESS, WorkflowStatus.PARTIAL].includes(run.status);
      if (!ownsLiveLease && !completedReplay) {
        throw new ConflictException(
          'Workflow execution no longer owns this finalization request',
        );
      }

      if (!current.requiresHumanApproval) {
        if (ownsLiveLease) {
          run.status = WorkflowStatus.SUCCESS;
          run.claimExpiresAt = null;
          run.finishedAt = new Date();
          run.outputPayload = {
            ...(run.outputPayload ?? {}),
            reviewTaskId: null,
            notificationFound: false,
          };
          await runRepo.save(run);
        }
        return {
          approvalRequired: false,
          reviewTaskId: null,
          notificationFound: false,
          reused: completedReplay,
        };
      }

      let ownerId: string | null;
      let leadId: string | null = null;
      let customerId: string | null = null;
      if (dto.entityType === 'Lead') {
        const lead = await manager
          .getRepository(Lead)
          .findOne({ where: { id: dto.entityId } });
        if (!lead) throw new NotFoundException('Lead not found');
        ownerId = lead.ownerId;
        leadId = lead.id;
        let task = await reviewTaskRepo.findOne({
          where: { workflowRunId: dto.workflowRunId, leadId: dto.entityId },
        });
        if (!task) {
          task = await reviewTaskRepo.save(
            reviewTaskRepo.create({
              leadId: dto.entityId,
              workflowRunId: dto.workflowRunId,
              assignedTo: ownerId,
              status: ReviewStatus.PENDING,
              reason:
                'Next Best Action recommendation requires human approval.',
              decision: null,
              reviewComment: null,
              startedAt: null,
              resolvedAt: null,
            }),
          );
        }
        current.reviewTaskId = task.id;
      } else {
        const customer = await manager
          .getRepository(Customer)
          .findOne({ where: { id: dto.entityId } });
        if (!customer) throw new NotFoundException('Customer not found');
        ownerId = customer.createdBy;
        customerId = customer.id;
      }

      let notificationFound = false;
      if (ownerId) {
        const key = `wf10:${dto.workflowRunId}:${ownerId}`;
        let notification = await notificationRepo.findOne({
          where: { idempotencyKey: key },
        });
        if (!notification) {
          notification = await notificationRepo.save(
            notificationRepo.create({
              userId: ownerId,
              type: NotificationType.HUMAN_REVIEW_REQUIRED,
              title: 'Next Best Action requires review',
              content: `A recommendation for ${dto.entityType} ${dto.entityId} requires human review.`,
              leadId,
              customerId,
              reviewTaskId: current.reviewTaskId,
              isRead: false,
              readAt: null,
              idempotencyKey: key,
            }),
          );
        }
        notificationFound = Boolean(notification.id);
      }
      current.status = 'PENDING_APPROVAL';
      await recommendationRepo.save(current);
      run.status = WorkflowStatus.PARTIAL;
      run.claimExpiresAt = null;
      run.finishedAt = null;
      run.outputPayload = {
        ...(run.outputPayload ?? {}),
        reviewTaskId: current.reviewTaskId,
        notificationFound,
      };
      await runRepo.save(run);
      return {
        approvalRequired: true,
        reviewTaskId: current.reviewTaskId,
        notificationFound,
        notificationMode:
          dto.entityType === 'Lead'
            ? 'REVIEW_TASK_AND_NOTIFICATION'
            : 'OWNER_NOTIFICATION',
        reused: completedReplay,
      };
    });
  }
}
