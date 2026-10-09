import { NotFoundException } from '@nestjs/common';
import {
  CONFIDENCE_THRESHOLD,
  LeadIntelligenceService,
} from './lead-intelligence.service.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import { QualificationStatus } from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ReviewStatus } from '../review/enums/review.enum.js';
import type { Repository } from 'typeorm';
import type { LeadQualification } from './entities/lead-qualification.entity.js';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import type { ReviewTask } from '../review/entities/review-task.entity.js';
import type { Notification } from '../notifications/entities/notification.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';

describe('LeadIntelligenceService', () => {
  let service: LeadIntelligenceService;
  let qualificationsRepo: jest.Mocked<Partial<Repository<LeadQualification>>>;
  let leadsRepo: jest.Mocked<Partial<Repository<Lead>>>;
  let workflowRunsRepo: jest.Mocked<Partial<Repository<WorkflowRun>>>;
  let reviewTasksRepo: jest.Mocked<Partial<Repository<ReviewTask>>>;
  let notificationsRepo: jest.Mocked<Partial<Repository<Notification>>>;
  let rabbitmqService: jest.Mocked<Partial<RabbitMQService>>;

  const mockLead: Lead = {
    id: 'lead-123',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: null,
    companyName: 'Tech Innovations',
    companyWebsite: null,
    jobTitle: 'CTO',
    companySize: 100,
    industry: 'Software',
    status: LeadStatus.NEW,
    sourceId: 'source-123',
    ownerId: 'user-owner-123',
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWorkflowRun: WorkflowRun = {
    id: 'wf-run-123',
    workflowName: 'lead-qualification',
    n8nExecutionId: null,
    leadId: 'lead-123',
    customerId: null,
    triggeredByUserId: null,
    status: WorkflowStatus.PENDING,
    inputPayload: {},
    outputPayload: null,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
  };

  const mockQualification: LeadQualification = {
    id: 'qual-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    status: QualificationStatus.QUALIFIED,
    intent: 'Looking for CRM automation',
    confidence: 0.95,
    reason: 'Clear B2B intent and high budget match',
    modelProvider: 'openai',
    modelName: 'gpt-4o',
    modelVersion: '2024-08-06',
    inputSnapshot: {},
    outputSnapshot: {},
    createdAt: new Date(),
  };

  beforeEach(() => {
    qualificationsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    leadsRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    workflowRunsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    reviewTasksRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
    };

    notificationsRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    rabbitmqService = {
      publishLeadQualificationRequested: jest.fn().mockResolvedValue({
        eventId: 'event-123',
        eventType: 'lead.qualification.requested',
        version: 1,
        occurredAt: new Date().toISOString(),
        data: { leadId: 'lead-123', workflowRunId: 'wf-run-123' },
      }),
    };

    service = new LeadIntelligenceService(
      qualificationsRepo as Repository<LeadQualification>,
      leadsRepo as Repository<Lead>,
      workflowRunsRepo as Repository<WorkflowRun>,
      reviewTasksRepo as Repository<ReviewTask>,
      notificationsRepo as Repository<Notification>,
      rabbitmqService as RabbitMQService,
    );
  });

  describe('triggerQualification', () => {
    it('should throw NotFoundException if lead does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.triggerQualification('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should set status to QUALIFYING, create WorkflowRun, and publish event', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({ ...mockLead });
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );
      (workflowRunsRepo.create as jest.Mock).mockReturnValue(mockWorkflowRun);
      (workflowRunsRepo.save as jest.Mock).mockResolvedValue(mockWorkflowRun);

      const result = await service.triggerQualification('lead-123');

      expect(result.leadId).toBe('lead-123');
      expect(result.workflowRunId).toBe('wf-run-123');
      expect(leadsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.QUALIFYING }),
      );
      expect(workflowRunsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 'lead-qualification',
          leadId: 'lead-123',
          status: WorkflowStatus.PENDING,
        }),
      );
      expect(
        rabbitmqService.publishLeadQualificationRequested,
      ).toHaveBeenCalledWith({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
      });
    });
  });

  describe('handleQualificationCallback', () => {
    it('should throw NotFoundException if lead does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.handleQualificationCallback({
          leadId: 'invalid-id',
          status: QualificationStatus.QUALIFIED,
          confidence: 0.9,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should automatically accept high confidence qualification and update lead status to QUALIFIED', async () => {
      const currentLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (qualificationsRepo.create as jest.Mock).mockReturnValue(
        mockQualification,
      );
      (qualificationsRepo.save as jest.Mock).mockResolvedValue(
        mockQualification,
      );
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
      });
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const result = await service.handleQualificationCallback({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: QualificationStatus.QUALIFIED,
        confidence: 0.95,
        reason: 'Strong intent',
      });

      expect(result.reviewRequired).toBe(false);
      expect(result.leadStatus).toBe(LeadStatus.QUALIFIED);
      expect(reviewTasksRepo.create).not.toHaveBeenCalled();
      expect(notificationsRepo.create).not.toHaveBeenCalled();
      expect(leadsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.QUALIFIED }),
      );
    });

    it('should automatically accept DISQUALIFIED with high confidence and update status to LOST', async () => {
      const currentLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (qualificationsRepo.create as jest.Mock).mockReturnValue({
        ...mockQualification,
        status: QualificationStatus.DISQUALIFIED,
      });
      (qualificationsRepo.save as jest.Mock).mockResolvedValue({
        ...mockQualification,
        status: QualificationStatus.DISQUALIFIED,
      });
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
      });
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const result = await service.handleQualificationCallback({
        leadId: 'lead-123',
        status: QualificationStatus.DISQUALIFIED,
        confidence: 0.88,
      });

      expect(result.reviewRequired).toBe(false);
      expect(result.leadStatus).toBe(LeadStatus.LOST);
    });

    it('should trigger human review and create ReviewTask and Notification when confidence < 0.80', async () => {
      const currentLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      const lowConfidenceQual = {
        ...mockQualification,
        confidence: 0.65,
        status: QualificationStatus.QUALIFIED,
      };

      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (qualificationsRepo.create as jest.Mock).mockReturnValue(
        lowConfidenceQual,
      );
      (qualificationsRepo.save as jest.Mock).mockResolvedValue(
        lowConfidenceQual,
      );
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
      });
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const mockReviewTask: ReviewTask = {
        id: 'review-task-123',
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        assignedTo: 'user-owner-123',
        status: ReviewStatus.PENDING,
        reason: 'Low confidence',
        decision: null,
        reviewComment: null,
        createdAt: new Date(),
        startedAt: null,
        resolvedAt: null,
      };

      (reviewTasksRepo.create as jest.Mock).mockReturnValue(mockReviewTask);
      (reviewTasksRepo.save as jest.Mock).mockResolvedValue(mockReviewTask);
      (notificationsRepo.create as jest.Mock).mockReturnValue({
        id: 'notif-123',
      });
      (notificationsRepo.save as jest.Mock).mockResolvedValue({
        id: 'notif-123',
      });

      const result = await service.handleQualificationCallback({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: QualificationStatus.QUALIFIED,
        confidence: 0.65,
        reason: 'Ambiguous job title and budget not specified',
      });

      expect(result.reviewRequired).toBe(true);
      expect(result.reviewTaskId).toBe('review-task-123');
      expect(reviewTasksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-123',
          assignedTo: 'user-owner-123',
          status: ReviewStatus.PENDING,
        }),
      );
      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-owner-123',
          type: 'REVIEW_REQUIRED',
          leadId: 'lead-123',
          reviewTaskId: 'review-task-123',
        }),
      );
    });

    it('should reuse existing pending ReviewTask on duplicate callback retry (Idempotency)', async () => {
      const currentLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      const lowConfidenceQual = {
        ...mockQualification,
        confidence: 0.6,
        status: QualificationStatus.NEEDS_REVIEW,
      };

      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (qualificationsRepo.create as jest.Mock).mockReturnValue(
        lowConfidenceQual,
      );
      (qualificationsRepo.save as jest.Mock).mockResolvedValue(
        lowConfidenceQual,
      );
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
      });
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const existingTask: ReviewTask = {
        id: 'existing-task-999',
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        assignedTo: 'user-owner-123',
        status: ReviewStatus.PENDING,
        reason: 'Existing low confidence reason',
        decision: null,
        reviewComment: null,
        createdAt: new Date(),
        startedAt: null,
        resolvedAt: null,
      };

      // Mock that a pending review task already exists
      (reviewTasksRepo.findOne as jest.Mock).mockResolvedValue(existingTask);

      const result = await service.handleQualificationCallback({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: QualificationStatus.NEEDS_REVIEW,
        confidence: 0.6,
      });

      expect(result.reviewRequired).toBe(true);
      expect(result.reviewTaskId).toBe('existing-task-999');
      // Must NOT create a new task or send duplicate notification
      expect(reviewTasksRepo.create).not.toHaveBeenCalled();
      expect(notificationsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('CONFIDENCE_THRESHOLD', () => {
    it('should be exactly 0.80 as specified by business requirements', () => {
      expect(CONFIDENCE_THRESHOLD).toBe(0.8);
    });
  });
});
