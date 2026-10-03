import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewTask } from './entities/review-task.entity.js';
import { ReviewDecision, ReviewStatus } from './enums/review.enum.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import {
  AssignReviewTaskDto,
  CreateReviewTaskDto,
  ResolveReviewTaskDto,
} from './dto/index.js';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(ReviewTask)
    private readonly reviewTaskRepository: Repository<ReviewTask>,

    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async create(dto: CreateReviewTaskDto): Promise<ReviewTask> {
    const lead = await this.leadRepository.findOne({
      where: { id: dto.leadId },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const reviewTask = this.reviewTaskRepository.create({
      leadId: dto.leadId,
      workflowRunId: dto.workflowRunId ?? null,
      reason: dto.reason ?? null,
      status: ReviewStatus.PENDING,
      assignedTo: null,
      decision: null,
      reviewComment: null,
      startedAt: null,
      resolvedAt: null,
    });

    const savedTask = await this.reviewTaskRepository.save(reviewTask);

    return savedTask;
  }

  async findAll(): Promise<ReviewTask[]> {
    const reviewTasks = await this.reviewTaskRepository.find({
      relations: {
        lead: true,
        assignee: true,
        workflowRun: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    for (const reviewTask of reviewTasks) {
      if (reviewTask.assignee) {
        const { passwordHash, ...safeAssignee } = reviewTask.assignee;
        void passwordHash;
        reviewTask.assignee = safeAssignee as User;
      }
    }

    return reviewTasks;
  }

  async findOne(id: string): Promise<ReviewTask> {
    const reviewTask = await this.reviewTaskRepository.findOne({
      where: { id },
      relations: {
        lead: true,
        assignee: true,
        workflowRun: true,
        notifications: true,
      },
    });

    if (!reviewTask) {
      throw new NotFoundException('Review task not found');
    }

    if (reviewTask.assignee) {
      const { passwordHash, ...safeAssignee } = reviewTask.assignee;
      void passwordHash;
      reviewTask.assignee = safeAssignee as User;
    }

    return reviewTask;
  }

  async assign(id: string, dto: AssignReviewTaskDto): Promise<ReviewTask> {
    const reviewTask = await this.findOne(id);

    const reviewer = await this.userRepository.findOne({
      where: { id: dto.reviewerId },
    });

    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    reviewTask.assignedTo = reviewer.id;

    const savedTask = await this.reviewTaskRepository.save(reviewTask);

    await this.createNotification(reviewer.id, savedTask, reviewTask.leadId);

    return savedTask;
  }

  async start(id: string): Promise<ReviewTask> {
    const reviewTask = await this.findOne(id);

    if (reviewTask.status !== ReviewStatus.PENDING) {
      throw new BadRequestException('Only PENDING review tasks can be started');
    }

    if (!reviewTask.assignedTo) {
      throw new BadRequestException(
        'Review task must be assigned before starting',
      );
    }

    reviewTask.status = ReviewStatus.IN_REVIEW;
    reviewTask.startedAt = new Date();

    return this.reviewTaskRepository.save(reviewTask);
  }

  async resolve(id: string, dto: ResolveReviewTaskDto): Promise<ReviewTask> {
    const reviewTask = await this.findOne(id);

    if (reviewTask.status !== ReviewStatus.IN_REVIEW) {
      throw new BadRequestException('Only IN_REVIEW tasks can be resolved');
    }

    if (!reviewTask.assignedTo) {
      throw new BadRequestException('Review task has no reviewer');
    }

    const oldValue = {
      status: reviewTask.status,
      decision: reviewTask.decision,
      reviewComment: reviewTask.reviewComment,
    };

    reviewTask.status = ReviewStatus.RESOLVED;
    reviewTask.decision = dto.decision;
    reviewTask.reviewComment = dto.reviewComment ?? null;
    reviewTask.resolvedAt = new Date();

    const savedTask = await this.reviewTaskRepository.save(reviewTask);

    await this.updateLeadAfterReview(savedTask);

    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: savedTask.assignedTo,
        action: 'REVIEW_RESOLVED',
        entityType: 'ReviewTask',
        entityId: savedTask.id,
        oldValue,
        newValue: {
          status: savedTask.status,
          decision: savedTask.decision,
          reviewComment: savedTask.reviewComment,
        },
        metadata: {
          leadId: savedTask.leadId,
        },
        ipAddress: null,
        userAgent: null,
      }),
    );

    return savedTask;
  }

  private async createNotification(
    userId: string,
    reviewTask: ReviewTask,
    leadId: string,
  ): Promise<void> {
    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId,
        type: 'HUMAN_REVIEW_REQUIRED',
        title: 'Human review required',
        content: `Lead ${leadId} requires manual review.`,
        leadId,
        customerId: null,
        reviewTaskId: reviewTask.id,
        isRead: false,
        readAt: null,
      }),
    );
  }

  private async updateLeadAfterReview(reviewTask: ReviewTask): Promise<void> {
    const lead = await this.leadRepository.findOne({
      where: { id: reviewTask.leadId },
    });

    if (!lead) {
      return;
    }

    if (reviewTask.decision === ReviewDecision.APPROVE) {
      lead.status = 'QUALIFIED' as typeof lead.status;
    }

    if (reviewTask.decision === ReviewDecision.REJECT) {
      lead.status = 'LOST' as typeof lead.status;
    }

    if (reviewTask.decision === ReviewDecision.MODIFY) {
      lead.status = 'QUALIFYING' as typeof lead.status;
    }

    await this.leadRepository.save(lead);
  }
}
