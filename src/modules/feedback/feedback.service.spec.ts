/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service.js';
import { FeedbackStatus } from './entities/customer-feedback.entity.js';
import {
  CustomerTaskPriority,
  CustomerTaskStatus,
} from './entities/customer-task.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let feedbackRepository: any;
  let customerTasksRepository: any;
  let customersRepository: any;
  let workflowRunsRepository: any;
  let notificationsRepository: any;
  let configService: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'admin-uuid',
    email: 'admin@example.com',
    name: 'Admin User',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSalesUser1: AuthenticatedUser = {
    id: 'user-1-uuid',
    email: 'sales1@example.com',
    name: 'Sales Rep 1',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSalesUser2: AuthenticatedUser = {
    id: 'user-2-uuid',
    email: 'sales2@example.com',
    name: 'Sales Rep 2',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    feedbackRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'feedback-uuid' })),
      save: jest.fn((entity: any) =>
        Promise.resolve({
          ...entity,
          id: entity.id || 'feedback-uuid',
        }),
      ),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    customerTasksRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'task-uuid' })),
      save: jest.fn((entity: any) =>
        Promise.resolve({
          ...entity,
          id: entity.id || 'task-uuid',
        }),
      ),
      findOne: jest.fn(),
    };

    customersRepository = {
      findOne: jest.fn(),
    };

    workflowRunsRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'run-uuid' })),
      save: jest.fn((entity: any) =>
        Promise.resolve({
          ...entity,
          id: entity.id || 'run-uuid',
        }),
      ),
      findOne: jest.fn(),
    };

    notificationsRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'notif-uuid' })),
      save: jest.fn((entity: any) =>
        Promise.resolve({
          ...entity,
          id: entity.id || 'notif-uuid',
        }),
      ),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'N8N_INTERNAL_URL') return 'http://localhost:5678';
        if (key === 'N8N_API_KEY') return 'test-api-key';
        return null;
      }),
    };

    service = new FeedbackService(
      feedbackRepository,
      customerTasksRepository,
      customersRepository,
      workflowRunsRepository,
      notificationsRepository,
      configService,
    );
  });

  describe('redactSensitiveContent', () => {
    it('should mask emails, phone numbers, and 16-digit cards', () => {
      const raw =
        'Customer email john.doe@example.com, phone +84 912345678, card 4111 2222 3333 4444';
      const redacted = service.redactSensitiveContent(raw);

      expect(redacted).not.toContain('john.doe@example.com');
      expect(redacted).toContain('[REDACTED_EMAIL]');
      expect(redacted).not.toContain('+84 912345678');
      expect(redacted).toContain('[REDACTED_PHONE]');
      expect(redacted).not.toContain('4111 2222 3333 4444');
      expect(redacted).toContain('[REDACTED_CARD]');
    });

    it('should mask IBAN and bank account numbers', () => {
      const raw =
        'IBAN GB82WEST12345698765432 and số tài khoản: 1234567890 for payment';
      const redacted = service.redactSensitiveContent(raw);

      expect(redacted).not.toContain('GB82WEST12345698765432');
      expect(redacted).not.toContain('1234567890');
      expect(redacted).toContain('[REDACTED_ACCOUNT]');
    });
  });

  describe('Customer access validation & createFeedback', () => {
    it('should allow customer creator to submit feedback', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });

      const result = await service.createFeedback(
        {
          customerId: 'customer-1',
          content: 'Great support, but need better performance',
          rating: 4,
        },
        mockSalesUser1,
      );

      expect(result.feedbackId).toBe('feedback-uuid');
      expect(result.status).toBe(FeedbackStatus.NEW);
      expect(feedbackRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: FeedbackStatus.NEW,
          customerId: 'customer-1',
        }),
      );
    });

    it('should allow ADMIN to submit feedback for any customer', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });

      const result = await service.createFeedback(
        {
          customerId: 'customer-1',
          content: 'Admin feedback submission',
        },
        mockAdminUser,
      );

      expect(result.feedbackId).toBe('feedback-uuid');
    });

    it('should reject non-owner SALES user with ForbiddenException', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });

      await expect(
        service.createFeedback(
          {
            customerId: 'customer-1',
            content: 'Sales 2 unauthorized attempt',
          },
          mockSalesUser2,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if customer does not exist', async () => {
      customersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createFeedback(
          {
            customerId: 'customer-nonexistent',
            content: 'Feedback for missing customer',
          },
          mockSalesUser1,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleCallback correlation & failure handling', () => {
    it('should reject callback if feedback does not exist', async () => {
      feedbackRepository.findOne.mockResolvedValue(null);

      await expect(
        service.handleCallback({
          feedbackId: 'fb-missing',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject callback if workflowRun does not exist', async () => {
      feedbackRepository.findOne.mockResolvedValue({
        id: 'fb-1',
        customerId: 'customer-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.handleCallback({
          feedbackId: 'fb-1',
          workflowRunId: 'run-missing',
          status: 'SUCCESS',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject callback if workflowName does not match t12-wf14-customer-feedback', async () => {
      feedbackRepository.findOne.mockResolvedValue({
        id: 'fb-1',
        customerId: 'customer-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 'other-workflow',
        customerId: 'customer-1',
      });

      await expect(
        service.handleCallback({
          feedbackId: 'fb-1',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject callback if customerId does not match', async () => {
      feedbackRepository.findOne.mockResolvedValue({
        id: 'fb-1',
        customerId: 'customer-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf14-customer-feedback',
        customerId: 'different-customer',
      });

      await expect(
        service.handleCallback({
          feedbackId: 'fb-1',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update feedback to ESCALATED on SUCCESS with escalationRequired', async () => {
      const mockFeedback = {
        id: 'fb-1',
        customerId: 'customer-1',
        status: FeedbackStatus.NEW,
        workflowRunId: 'run-1',
      };
      const mockRun = {
        id: 'run-1',
        workflowName: 't12-wf14-customer-feedback',
        customerId: 'customer-1',
        status: WorkflowStatus.PENDING,
      };

      feedbackRepository.findOne.mockResolvedValue(mockFeedback);
      workflowRunsRepository.findOne.mockResolvedValue(mockRun);

      const res = await service.handleCallback({
        feedbackId: 'fb-1',
        workflowRunId: 'run-1',
        status: 'SUCCESS',
        sentiment: 'NEGATIVE',
        category: 'Product Quality',
        urgency: 'HIGH',
        escalationRequired: true,
      });

      expect(res.status).toBe(FeedbackStatus.ESCALATED);
      expect(mockFeedback.status).toBe(FeedbackStatus.ESCALATED);
      expect(mockRun.status).toBe(WorkflowStatus.SUCCESS);
    });

    it('should persist FAILED status and error message when callback reports FAILED', async () => {
      const mockFeedback: any = {
        id: 'fb-1',
        customerId: 'customer-1',
        status: FeedbackStatus.NEW,
        workflowRunId: 'run-1',
        errorMessage: null,
      };
      const mockRun: any = {
        id: 'run-1',
        workflowName: 't12-wf14-customer-feedback',
        customerId: 'customer-1',
        status: WorkflowStatus.PENDING,
        errorMessage: null,
      };

      feedbackRepository.findOne.mockResolvedValue(mockFeedback);
      workflowRunsRepository.findOne.mockResolvedValue(mockRun);

      const res = await service.handleCallback({
        feedbackId: 'fb-1',
        workflowRunId: 'run-1',
        status: 'FAILED',
        errorMessage: 'Gemini rate limit exceeded',
      });

      expect(res.status).toBe(FeedbackStatus.FAILED);
      expect(mockFeedback.status).toBe(FeedbackStatus.FAILED);
      expect(mockFeedback.errorMessage).toBe('Gemini rate limit exceeded');
      expect(mockRun.status).toBe(WorkflowStatus.FAILED);
      expect(mockRun.errorMessage).toBe('Gemini rate limit exceeded');
    });
  });

  describe('ensureCustomerTask idempotent & collision safe', () => {
    it('should return existing task if idempotencyKey and payload match', async () => {
      customersRepository.findOne.mockResolvedValue({ id: 'customer-1' });
      const existingTask = {
        id: 'existing-task-id',
        customerId: 'customer-1',
        taskType: 'FEEDBACK_ESCALATION',
        title: 'Escalated feedback',
        customerFeedbackId: null,
        sourceEntityId: null,
        idempotencyKey: 'feedback-task-123',
      };
      customerTasksRepository.findOne.mockResolvedValue(existingTask);

      const res = await service.ensureCustomerTask({
        customerId: 'customer-1',
        taskType: 'FEEDBACK_ESCALATION',
        title: 'Escalated feedback',
        idempotencyKey: 'feedback-task-123',
      });

      expect(res.created).toBe(false);
      expect(res.task.id).toBe('existing-task-id');
      expect(customerTasksRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if idempotencyKey exists with different customer or taskType', async () => {
      customersRepository.findOne.mockResolvedValue({ id: 'customer-1' });
      const existingTask = {
        id: 'existing-task-id',
        customerId: 'customer-2', // Different customer!
        taskType: 'FEEDBACK_ESCALATION',
        title: 'Escalated feedback',
        idempotencyKey: 'reused-key',
      };
      customerTasksRepository.findOne.mockResolvedValue(existingTask);

      await expect(
        service.ensureCustomerTask({
          customerId: 'customer-1',
          taskType: 'FEEDBACK_ESCALATION',
          title: 'Escalated feedback',
          idempotencyKey: 'reused-key',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if customer is not found', async () => {
      customersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.ensureCustomerTask({
          customerId: 'non-existent',
          taskType: 'FEEDBACK_ESCALATION',
          title: 'Escalated feedback',
          idempotencyKey: 'key-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate and link CustomerFeedback relation', async () => {
      customersRepository.findOne.mockResolvedValue({ id: 'customer-1' });
      feedbackRepository.findOne.mockResolvedValue({
        id: 'feedback-1',
        customerId: 'customer-1',
      });
      customerTasksRepository.findOne.mockResolvedValue(null);

      const res = await service.ensureCustomerTask({
        customerId: 'customer-1',
        customerFeedbackId: 'feedback-1',
        taskType: 'FEEDBACK_ESCALATION',
        title: 'Feedback task',
        idempotencyKey: 'key-with-feedback',
      });

      expect(res.created).toBe(true);
      expect(customerTasksRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerFeedbackId: 'feedback-1',
          sourceEntityType: 'CUSTOMER_FEEDBACK',
          sourceEntityId: 'feedback-1',
        }),
      );
    });

    it('should throw BadRequestException if referenced feedback belongs to a different customer', async () => {
      customersRepository.findOne.mockResolvedValue({ id: 'customer-1' });
      feedbackRepository.findOne.mockResolvedValue({
        id: 'feedback-1',
        customerId: 'other-customer', // Mismatch!
      });

      await expect(
        service.ensureCustomerTask({
          customerId: 'customer-1',
          customerFeedbackId: 'feedback-1',
          taskType: 'FEEDBACK_ESCALATION',
          title: 'Feedback task',
          idempotencyKey: 'key-mismatch',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create new task if not existing', async () => {
      customersRepository.findOne.mockResolvedValue({ id: 'customer-1' });
      customerTasksRepository.findOne.mockResolvedValue(null);

      const res = await service.ensureCustomerTask({
        customerId: 'customer-1',
        taskType: 'FEEDBACK_ESCALATION',
        title: 'Escalated feedback',
        idempotencyKey: 'feedback-task-unique',
      });

      expect(res.created).toBe(true);
      expect(customerTasksRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'feedback-task-unique',
          priority: CustomerTaskPriority.MEDIUM,
          status: CustomerTaskStatus.OPEN,
        }),
      );
    });

    it('should catch 23505 collision error and return existing task if payload matches', async () => {
      customersRepository.findOne.mockResolvedValue({ id: 'customer-1' });
      customerTasksRepository.findOne
        .mockResolvedValueOnce(null) // first find returns null
        .mockResolvedValueOnce({
          id: 'collision-task-id',
          customerId: 'customer-1',
          taskType: 'FEEDBACK_ESCALATION',
          title: 'Race condition task',
          customerFeedbackId: null,
          sourceEntityId: null,
          idempotencyKey: 'race-key',
        }); // second find after collision returns record

      customerTasksRepository.save.mockRejectedValue({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "UQ_customer_tasks_idempotency_key"',
      });

      const res = await service.ensureCustomerTask({
        customerId: 'customer-1',
        taskType: 'FEEDBACK_ESCALATION',
        title: 'Race condition task',
        idempotencyKey: 'race-key',
      });

      expect(res.created).toBe(false);
      expect(res.task.id).toBe('collision-task-id');
    });
  });

  describe('Read endpoints & internal get', () => {
    it('should allow customer owner to read feedback', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });
      feedbackRepository.findOne.mockResolvedValue({
        id: 'fb-1',
        customerId: 'customer-1',
      });

      const fb = await service.getFeedback('fb-1', mockSalesUser1);
      expect(fb.id).toBe('fb-1');
    });

    it('should disallow non-owner to read feedback', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });
      feedbackRepository.findOne.mockResolvedValue({
        id: 'fb-1',
        customerId: 'customer-1',
      });

      await expect(service.getFeedback('fb-1', mockSalesUser2)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow getInternalFeedback without user context', async () => {
      feedbackRepository.findOne.mockResolvedValue({
        id: 'fb-1',
        customerId: 'customer-1',
      });

      const fb = await service.getInternalFeedback('fb-1');
      expect(fb.id).toBe('fb-1');
    });
  });
});
