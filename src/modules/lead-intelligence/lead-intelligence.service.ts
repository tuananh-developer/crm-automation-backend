import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadQualification } from './entities/lead-qualification.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { ReviewTask } from '../review/entities/review-task.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import { QualificationStatus } from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ReviewStatus } from '../review/enums/review.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import {
  QualificationCallbackDto,
  TriggerQualificationDto,
} from './dto/index.js';

export const CONFIDENCE_THRESHOLD = 0.8;

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
}
