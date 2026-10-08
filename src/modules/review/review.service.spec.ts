import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReviewService } from './review.service.js';
import { ReviewDecision, ReviewStatus } from './enums/review.enum.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import type { Repository } from 'typeorm';
import type { ReviewTask } from './entities/review-task.entity.js';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { User } from '../users/entities/user.entity.js';
import type { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import type { Notification } from '../notifications/entities/notification.entity.js';
import type { AuditLog } from '../audit/entities/audit-log.entity.js';
import {
  CreateReviewTaskDto,
  AssignReviewTaskDto,
  ResolveReviewTaskDto,
} from './dto/index.js';

describe('ReviewService', () => {
  let service: ReviewService;
  let reviewTaskRepository: jest.Mocked<Partial<Repository<ReviewTask>>>;
  let leadRepository: jest.Mocked<Partial<Repository<Lead>>>;
  let userRepository: jest.Mocked<Partial<Repository<User>>>;
  let workflowRunRepository: jest.Mocked<Partial<Repository<WorkflowRun>>>;
  let notificationRepository: jest.Mocked<Partial<Repository<Notification>>>;
  let auditLogRepository: jest.Mocked<Partial<Repository<AuditLog>>>;

  const mockLead: Lead = {
    id: 'lead-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    jobTitle: 'VP Sales',
    companySize: 50,
    industry: 'Technology',
    status: LeadStatus.NEW,
    sourceId: 'source-123',
    ownerId: null,
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: 'Initial contact',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReviewer: User = {
    id: 'reviewer-123',
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    passwordHash: 'hashed',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNonSalesUser: User = {
    id: 'non-sales-123',
    name: 'Bob Admin',
    email: 'bob.admin@example.com',
    passwordHash: 'hashed',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockInactiveUser: User = {
    id: 'inactive-123',
    name: 'Inactive User',
    email: 'inactive@example.com',
    passwordHash: 'hashed',
    role: UserRole.SALES,
    status: UserStatus.INACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWorkflowRun: WorkflowRun = {
    id: 'wf-run-123',
    workflowName: 'AI Qualification',
    n8nExecutionId: 'exec-123',
    leadId: 'lead-123',
    customerId: null,
    triggeredByUserId: null,
    status: 'COMPLETED' as any,
    inputPayload: null,
    outputPayload: null,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
  };

  const mockReviewTask: ReviewTask = {
    id: 'review-task-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    assignedTo: null,
    status: ReviewStatus.PENDING,
    reason: 'Low confidence score',
    decision: null,
    reviewComment: null,
    createdAt: new Date(),
    startedAt: null,
    resolvedAt: null,
    lead: mockLead,
    assignee: null,
    workflowRun: mockWorkflowRun,
    notifications: [],
  };

  const mockAssignedReviewTask: ReviewTask = {
    ...mockReviewTask,
    assignedTo: 'reviewer-123',
    assignee: mockReviewer,
  };

  beforeEach(() => {
    reviewTaskRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    leadRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    workflowRunRepository = {
      findOne: jest.fn(),
    };

    notificationRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    auditLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    (reviewTaskRepository.create as jest.Mock).mockImplementation(
      (data: Partial<ReviewTask>) =>
        ({ id: 'review-task-123', ...data }) as ReviewTask,
    );
    (reviewTaskRepository.save as jest.Mock).mockImplementation(
      (task: ReviewTask) => Promise.resolve(task),
    );
    (notificationRepository.create as jest.Mock).mockImplementation(
      (data: Partial<Notification>) => data as Notification,
    );
    (notificationRepository.save as jest.Mock).mockImplementation(
      (notification: Notification) => Promise.resolve(notification),
    );
    (auditLogRepository.create as jest.Mock).mockImplementation(
      (data: Partial<AuditLog>) => data as AuditLog,
    );
    (auditLogRepository.save as jest.Mock).mockImplementation(
      (auditLog: AuditLog) => Promise.resolve(auditLog),
    );
    (leadRepository.save as jest.Mock).mockImplementation((lead: Lead) =>
      Promise.resolve(lead),
    );

    service = new ReviewService(
      reviewTaskRepository as Repository<ReviewTask>,
      leadRepository as Repository<Lead>,
      userRepository as Repository<User>,
      workflowRunRepository as Repository<WorkflowRun>,
      notificationRepository as Repository<Notification>,
      auditLogRepository as Repository<AuditLog>,
    );
  });

  describe('create', () => {
    it('should create a review task successfully', async () => {
      (leadRepository.findOne as jest.Mock).mockResolvedValue(mockLead);
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValue(
        mockWorkflowRun,
      );
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(null);

      const dto: CreateReviewTaskDto = {
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        reason: 'Low confidence score',
      };

      const result = await service.create(dto);

      expect(result).toBeDefined();
      expect(result.leadId).toBe('lead-123');
      expect(result.workflowRunId).toBe('wf-run-123');
      expect(result.reason).toBe('Low confidence score');
      expect(result.status).toBe(ReviewStatus.PENDING);
      expect(result.assignedTo).toBeNull();
      expect(reviewTaskRepository.save).toHaveBeenCalled();
    });

    it('should create a review task without workflowRunId', async () => {
      (leadRepository.findOne as jest.Mock).mockResolvedValue(mockLead);
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(null);

      const dto: CreateReviewTaskDto = {
        leadId: 'lead-123',
        reason: 'Manual review needed',
      };

      const result = await service.create(dto);

      expect(result).toBeDefined();
      expect(result.leadId).toBe('lead-123');
      expect(result.workflowRunId).toBeNull();
      expect(result.status).toBe(ReviewStatus.PENDING);
    });

    it('should throw NotFoundException when lead does not exist', async () => {
      (leadRepository.findOne as jest.Mock).mockResolvedValue(null);

      const dto: CreateReviewTaskDto = { leadId: 'non-existent-lead' };

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when workflowRun does not exist', async () => {
      (leadRepository.findOne as jest.Mock).mockResolvedValue(mockLead);
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValue(null);

      const dto: CreateReviewTaskDto = {
        leadId: 'lead-123',
        workflowRunId: 'non-existent-wf',
      };

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when workflowRun does not belong to lead', async () => {
      (leadRepository.findOne as jest.Mock).mockResolvedValue(mockLead);
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
        leadId: 'different-lead',
      });

      const dto: CreateReviewTaskDto = {
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return all review tasks', async () => {
      (reviewTaskRepository.find as jest.Mock).mockResolvedValue([
        mockReviewTask,
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('review-task-123');
    });
  });

  describe('findOne', () => {
    it('should return a review task by id', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(
        mockReviewTask,
      );

      const result = await service.findOne('review-task-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('review-task-123');
    });

    it('should throw NotFoundException when review task does not exist', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assign', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (reviewTaskRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockReviewTask }),
      );
      (userRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockReviewer }),
      );
    });

    it('should assign a reviewer successfully', async () => {
      const dto: AssignReviewTaskDto = { reviewerId: 'reviewer-123' };
      const result = await service.assign('review-task-123', dto);

      expect(result.assignedTo).toBe('reviewer-123');
      expect(notificationRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when review task does not exist', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(null);

      const dto: AssignReviewTaskDto = { reviewerId: 'reviewer-123' };
      await expect(service.assign('non-existent', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when task is not PENDING', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockReviewTask,
        status: ReviewStatus.IN_REVIEW,
      });

      const dto: AssignReviewTaskDto = { reviewerId: 'reviewer-123' };
      await expect(service.assign('review-task-123', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when reviewer does not exist', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValue(null);

      const dto: AssignReviewTaskDto = { reviewerId: 'non-existent' };
      await expect(service.assign('review-task-123', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when reviewer is not SALES role', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockNonSalesUser);

      const dto: AssignReviewTaskDto = { reviewerId: 'non-sales-123' };
      await expect(service.assign('review-task-123', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when reviewer is not ACTIVE', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockInactiveUser);

      const dto: AssignReviewTaskDto = { reviewerId: 'inactive-123' };
      await expect(service.assign('review-task-123', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when task is already assigned to different reviewer', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockReviewTask,
        assignedTo: 'different-reviewer',
      });
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockReviewer);

      const dto: AssignReviewTaskDto = { reviewerId: 'reviewer-123' };
      await expect(service.assign('review-task-123', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow re-assigning to the same reviewer', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(
        mockAssignedReviewTask,
      );
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockReviewer);

      const dto: AssignReviewTaskDto = { reviewerId: 'reviewer-123' };
      const result = await service.assign('review-task-123', dto);

      expect(result.assignedTo).toBe('reviewer-123');
    });

    it('should create notification on assign', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockReviewTask }),
      );
      (userRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockReviewer }),
      );

      const dto: AssignReviewTaskDto = { reviewerId: 'reviewer-123' };
      await service.assign('review-task-123', dto);

      expect(notificationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'reviewer-123',
          type: NotificationType.HUMAN_REVIEW_REQUIRED,
          title: 'Human review required',
          reviewTaskId: 'review-task-123',
        }),
      );
    });
  });

  describe('start', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should start a review task successfully', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockAssignedReviewTask }),
      );

      const result = await service.start('review-task-123');

      expect(result.status).toBe(ReviewStatus.IN_REVIEW);
      expect(result.startedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when review task does not exist', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.start('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when task is not PENDING', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ...mockAssignedReviewTask,
          status: ReviewStatus.IN_REVIEW,
        }),
      );

      await expect(service.start('review-task-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when task has no reviewer', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockReviewTask }),
      );

      await expect(service.start('review-task-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resolve', () => {
    const mockInReviewTask: ReviewTask = {
      ...mockAssignedReviewTask,
      status: ReviewStatus.IN_REVIEW,
      startedAt: new Date(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (reviewTaskRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockInReviewTask }),
      );
      (leadRepository.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ ...mockLead }),
      );
    });

    it('should resolve with APPROVE decision', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.APPROVE,
        reviewComment: 'Approved',
      };

      const result = await service.resolve('review-task-123', dto);

      expect(result.status).toBe(ReviewStatus.RESOLVED);
      expect(result.decision).toBe(ReviewDecision.APPROVE);
      expect(result.resolvedAt).toBeInstanceOf(Date);
      expect(result.reviewComment).toBe('Approved');
      expect(auditLogRepository.save).toHaveBeenCalled();
      expect(leadRepository.save).toHaveBeenCalled();
    });

    it('should resolve with REJECT decision', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.REJECT,
        reviewComment: 'Rejected',
      };

      const result = await service.resolve('review-task-123', dto);

      expect(result.status).toBe(ReviewStatus.RESOLVED);
      expect(result.decision).toBe(ReviewDecision.REJECT);
      expect(leadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.LOST }),
      );
    });

    it('should resolve with MODIFY decision', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.MODIFY,
        reviewComment: 'Modified',
      };

      const result = await service.resolve('review-task-123', dto);

      expect(result.status).toBe(ReviewStatus.RESOLVED);
      expect(result.decision).toBe(ReviewDecision.MODIFY);
      expect(result.reviewComment).toBe('Modified');
      expect(leadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.QUALIFYING }),
      );
    });

    it('should require reviewComment for MODIFY decision', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.MODIFY,
        reviewComment: '',
      };

      await expect(service.resolve('review-task-123', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when review task does not exist', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue(null);

      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.APPROVE,
        reviewComment: 'Approved',
      };
      await expect(service.resolve('non-existent', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when task is not IN_REVIEW', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockInReviewTask,
        status: ReviewStatus.PENDING,
      });

      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.APPROVE,
        reviewComment: 'Approved',
      };
      await expect(service.resolve('review-task-123', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when task has no reviewer', async () => {
      (reviewTaskRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockInReviewTask,
        assignedTo: null,
      });

      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.APPROVE,
        reviewComment: 'Approved',
      };
      await expect(service.resolve('review-task-123', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create audit log with correct data', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.APPROVE,
        reviewComment: 'Approved',
      };

      await service.resolve('review-task-123', dto);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REVIEW_RESOLVED',
          entityType: 'ReviewTask',
          entityId: 'review-task-123',
          userId: 'reviewer-123',
          metadata: { leadId: 'lead-123' },
        }),
      );
    });

    it('should update lead status to QUALIFIED on APPROVE', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.APPROVE,
        reviewComment: 'Approved',
      };

      await service.resolve('review-task-123', dto);

      expect(leadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.QUALIFIED }),
      );
    });

    it('should update lead status to LOST on REJECT', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.REJECT,
        reviewComment: 'Rejected',
      };

      await service.resolve('review-task-123', dto);

      expect(leadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.LOST }),
      );
    });

    it('should update lead status to QUALIFYING on MODIFY', async () => {
      const dto: ResolveReviewTaskDto = {
        decision: ReviewDecision.MODIFY,
        reviewComment: 'Modified',
      };

      await service.resolve('review-task-123', dto);

      expect(leadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.QUALIFYING }),
      );
    });
  });
});
