import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ReviewTask } from './entities/review-task.entity.js';
import { ReviewDecision, ReviewStatus } from './enums/review.enum.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
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

    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepository: Repository<WorkflowRun>,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,

    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateReviewTaskDto): Promise<ReviewTask> {
    const lead = await this.leadRepository.findOne({
      where: { id: dto.leadId },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (dto.workflowRunId) {
      const workflowRun = await this.workflowRunRepository.findOne({
        where: { id: dto.workflowRunId },
      });

      if (!workflowRun) {
        throw new NotFoundException('Workflow run not found');
      }

      if (workflowRun.leadId !== dto.leadId) {
        throw new BadRequestException(
          'Workflow run does not belong to the specified lead',
        );
      }
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

    return this.reviewTaskRepository.save(reviewTask);
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

    if (reviewTask.status !== ReviewStatus.PENDING) {
      throw new BadRequestException(
        'Only PENDING review tasks can be assigned',
      );
    }

    if (reviewTask.assignedTo && reviewTask.assignedTo !== dto.reviewerId) {
      throw new BadRequestException(
        'Review task is already assigned to a different reviewer',
      );
    }

    const reviewer = await this.userRepository.findOne({
      where: { id: dto.reviewerId },
    });

    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    if (reviewer.role !== UserRole.SALES) {
      throw new BadRequestException('Reviewer must have SALES role');
    }

    if (reviewer.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Reviewer must be ACTIVE');
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
    return this.dataSource.transaction(async (manager) => {
      const reviewTaskRepo = manager.getRepository(ReviewTask);
      const leadRepo = manager.getRepository(Lead);
      const auditLogRepo = manager.getRepository(AuditLog);

      const reviewTask = await reviewTaskRepo.findOne({
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

      if (reviewTask.status !== ReviewStatus.IN_REVIEW) {
        throw new BadRequestException('Only IN_REVIEW tasks can be resolved');
      }

      if (!reviewTask.assignedTo) {
        throw new BadRequestException('Review task has no reviewer');
      }

      if (dto.decision === ReviewDecision.MODIFY && !dto.reviewComment) {
        throw new BadRequestException(
          'reviewComment is required for MODIFY decision',
        );
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

      const savedTask = await reviewTaskRepo.save(reviewTask);

      // Update lead status based on decision
      const lead = await leadRepo.findOne({
        where: { id: savedTask.leadId },
      });

      if (lead) {
        if (savedTask.decision === ReviewDecision.APPROVE) {
          lead.status = 'QUALIFIED' as typeof lead.status;
        }

        if (savedTask.decision === ReviewDecision.REJECT) {
          lead.status = 'LOST' as typeof lead.status;
        }

        if (savedTask.decision === ReviewDecision.MODIFY) {
          lead.status = 'QUALIFYING' as typeof lead.status;
        }

        await leadRepo.save(lead);
      }

      await auditLogRepo.save(
        auditLogRepo.create({
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
    });
  }

  private async createNotification(
    userId: string,
    reviewTask: ReviewTask,
    leadId: string,
  ): Promise<void> {
    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId,
        type: NotificationType.HUMAN_REVIEW_REQUIRED,
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
}
