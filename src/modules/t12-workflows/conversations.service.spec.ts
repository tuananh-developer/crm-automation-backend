/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationsService,
  TranscriptProcessingStatus,
} from './conversations.service.js';
import { ConversationTranscript } from './entities/conversation-transcript.entity.js';
import { ConversationSummary } from './entities/conversation-summary.entity.js';
import {
  ActionItemApprovalState,
  ActionItemStatus,
  ConversationActionItem,
} from './entities/conversation-action-item.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let transcriptsRepository: any;
  let summariesRepository: any;
  let actionItemsRepository: any;
  let workflowRunsRepository: any;
  let notificationsRepository: any;
  let customersRepository: any;
  let leadsRepository: any;
  let usersRepository: any;
  let dataSource: any;
  let configService: any;
  let dispatcher: any;

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
    transcriptsRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'transcript-uuid' })),
      save: jest.fn((t: any) =>
        Promise.resolve({ ...t, id: t.id || 'transcript-uuid' }),
      ),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    summariesRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'summary-uuid' })),
      save: jest.fn((s: any) =>
        Promise.resolve({ ...s, id: s.id || 'summary-uuid' }),
      ),
      findOne: jest.fn(),
    };

    actionItemsRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'item-uuid' })),
      save: jest.fn((i: any) =>
        Promise.resolve({ ...i, id: i.id || 'item-uuid' }),
      ),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    workflowRunsRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'run-uuid' })),
      save: jest.fn((r: any) =>
        Promise.resolve({ ...r, id: r.id || 'run-uuid' }),
      ),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    notificationsRepository = {
      create: jest.fn((dto: any) => ({ ...dto, id: 'notif-uuid' })),
      save: jest.fn((n: any) =>
        Promise.resolve({ ...n, id: n.id || 'notif-uuid' }),
      ),
    };

    customersRepository = {
      findOne: jest.fn(),
    };

    leadsRepository = {
      findOne: jest.fn(),
    };

    usersRepository = {
      findOne: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(async (cb: any) => {
        const manager = {
          save: jest.fn((entity: any) =>
            Promise.resolve({ ...entity, id: entity.id || 'saved-uuid' }),
          ),
          create: jest.fn((entityClass: any, dto: any) => ({
            ...dto,
            id: 'created-uuid',
          })),
          findOne: jest.fn((entityClass: any, options: any) => {
            if (entityClass === ConversationTranscript) {
              return transcriptsRepository.findOne(options);
            }
            if (entityClass === WorkflowRun) {
              return workflowRunsRepository.findOne(options);
            }
            if (entityClass === ConversationSummary) {
              return summariesRepository.findOne(options);
            }
            return Promise.resolve(null);
          }),
          find: jest.fn(async (entityClass: any, options: any) => {
            if (entityClass === ConversationActionItem) {
              const res = await actionItemsRepository.find(options);
              return res ?? [];
            }
            return [];
          }),
          getRepository: jest.fn((entityClass: any) => {
            if (entityClass === ConversationTranscript) {
              return transcriptsRepository;
            }
            if (entityClass === WorkflowRun) {
              return workflowRunsRepository;
            }
            if (entityClass === ConversationSummary) {
              return summariesRepository;
            }
            if (entityClass === ConversationActionItem) {
              return actionItemsRepository;
            }
            return {
              save: jest.fn((e: any) =>
                Promise.resolve({ ...e, id: e.id || 'saved-uuid' }),
              ),
              create: jest.fn((dto: any) => ({ ...dto, id: 'created-uuid' })),
            };
          }),
        };
        return await cb(manager);
      }),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'N8N_INTERNAL_URL') return 'http://localhost:5678';
        if (key === 'N8N_API_KEY') return 'test-key';
        return null;
      }),
    };

    dispatcher = {
      enqueue: jest.fn().mockResolvedValue({ id: 'outbox-uuid' }),
    };

    service = new ConversationsService(
      transcriptsRepository,
      summariesRepository,
      actionItemsRepository,
      workflowRunsRepository,
      notificationsRepository,
      customersRepository,
      leadsRepository,
      usersRepository,
      dataSource,
      configService,
      dispatcher,
    );
  });

  describe('redactSensitiveContent', () => {
    it('redacts email addresses', () => {
      const input =
        'Contact john.doe@enterprise.com or support@sales.vn for renewal.';
      const output = service.redactSensitiveContent(input);
      expect(output).toBe(
        'Contact [REDACTED_EMAIL] or [REDACTED_EMAIL] for renewal.',
      );
    });

    it('redacts 16-digit credit cards with spaces or hyphens', () => {
      const input = 'Card 4111 2222 3333 4444 and 5500-1234-5678-9012 entered.';
      const output = service.redactSensitiveContent(input);
      expect(output).toBe('Card [REDACTED_CARD] and [REDACTED_CARD] entered.');
    });

    it('redacts bank account numbers and account IDs', () => {
      const input =
        'Số tài khoản: 19034567891234, STK: 001100223344, Account Number: 987654321012, acc no: 12345678.';
      const output = service.redactSensitiveContent(input);
      expect(output).toContain('[REDACTED_ACCOUNT]');
      expect(output).not.toContain('19034567891234');
      expect(output).not.toContain('001100223344');
      expect(output).not.toContain('987654321012');
    });

    it('redacts IBAN account codes', () => {
      const input = 'Transfer wire to GB29NWBK60161331926819 immediately.';
      const output = service.redactSensitiveContent(input);
      expect(output).toBe('Transfer wire to [REDACTED_ACCOUNT] immediately.');
    });

    it('redacts phone numbers in international and local formats', () => {
      const input = 'Call +84 912345678 or 0903123456 or (028) 38234567.';
      const output = service.redactSensitiveContent(input);
      expect(output).not.toContain('+84 912345678');
      expect(output).not.toContain('0903123456');
      expect(output).toContain('[REDACTED_PHONE]');
    });
  });

  describe('createTranscript access control', () => {
    it('throws ForbiddenException if sales user tries to ingest transcript for non-owned lead', async () => {
      leadsRepository.findOne.mockResolvedValue({
        id: 'lead-1',
        ownerId: 'different-sales-user',
      });

      await expect(
        service.createTranscript(
          {
            leadId: 'lead-1',
            content: 'Meeting notes',
          },
          mockSalesUser1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if sales user tries to ingest transcript for unassigned lead (ownerId is null)', async () => {
      leadsRepository.findOne.mockResolvedValue({
        id: 'lead-unassigned',
        ownerId: null,
      });

      await expect(
        service.createTranscript(
          {
            leadId: 'lead-unassigned',
            content: 'Meeting notes for unassigned lead',
          },
          mockSalesUser1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if sales user tries to ingest transcript for unassigned customer (createdBy is null)', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-unassigned',
        createdBy: null,
      });

      await expect(
        service.createTranscript(
          {
            customerId: 'customer-unassigned',
            content: 'Meeting notes for unassigned customer',
          },
          mockSalesUser1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if sales user tries to ingest transcript for customer created by another user', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-other',
        createdBy: mockSalesUser2.id,
      });

      await expect(
        service.createTranscript(
          {
            customerId: 'customer-other',
            content: 'Meeting notes for customer of user 2',
          },
          mockSalesUser1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows transcript creation for customer created by sales user', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      } as any);

      const result = await service.createTranscript(
        {
          customerId: 'customer-1',
          content: 'Discussed onboarding with Customer.',
        },
        mockSalesUser1,
      );

      expect(result.transcriptId).toBe('transcript-uuid');
    });

    it('allows admin user to create transcript for unassigned lead and unassigned customer', async () => {
      leadsRepository.findOne.mockResolvedValue({
        id: 'lead-unassigned',
        ownerId: null,
      });
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-unassigned',
        createdBy: null,
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      } as any);

      const result = await service.createTranscript(
        {
          leadId: 'lead-unassigned',
          customerId: 'customer-unassigned',
          content: 'Admin notes for unassigned entities.',
        },
        mockAdminUser,
      );

      expect(result.transcriptId).toBe('transcript-uuid');
    });
  });

  describe('handleCallback', () => {
    it('marks transcript and workflowRun as FAILED when status is FAILED without requiring summaryText', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        processingStatus: TranscriptProcessingStatus.PENDING,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.PENDING,
      });

      const res = await service.handleCallback({
        transcriptId: 't-1',
        workflowRunId: 'run-1',
        status: 'FAILED',
        errorMessage: 'Gemini rate limit exceeded',
      });

      expect(res.success).toBe(false);
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('persists summary and action items on SUCCESS inside transaction', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        createdBy: mockSalesUser1.id,
        sourceType: 'CALL',
        processingStatus: TranscriptProcessingStatus.PENDING,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.PENDING,
      });

      const res = await service.handleCallback({
        transcriptId: 't-1',
        workflowRunId: 'run-1',
        status: 'SUCCESS',
        summaryText: 'Client agreed to upgrade to enterprise plan.',
        sentiment: 'POSITIVE',
        intent: 'Plan Upgrade',
        keyPoints: ['Upgrading 50 seats'],
        actionItems: [
          {
            title: 'Send enterprise contract',
            dueAt: new Date().toISOString(),
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(res.summaryId).toBe('created-uuid');
      expect(res.actionItemCount).toBe(1);
    });

    it('throws NotFoundException if transcript is not found', async () => {
      transcriptsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.handleCallback({
          transcriptId: 'missing-t',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
          summaryText: 'Some summary',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if workflowRun is not found', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'missing-run',
          status: 'SUCCESS',
          summaryText: 'Some summary',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if transcript.workflowRunId mismatches workflowRun.id', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-different',
        workflowName: 't12-wf09-conversation-summarizer',
      });

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'run-different',
          status: 'SUCCESS',
          summaryText: 'Some summary',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if workflowName is not t12-wf09-conversation-summarizer', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't14-wf14-customer-feedback',
      });

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
          summaryText: 'Some summary',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if customerId does not match workflowRun', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        customerId: 'customer-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        customerId: 'customer-2',
      });

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
          summaryText: 'Some summary',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('locks ConversationTranscript and WorkflowRun with pessimistic_write inside transaction', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        createdBy: mockSalesUser1.id,
        processingStatus: TranscriptProcessingStatus.PENDING,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.PENDING,
      });

      const res = await service.handleCallback({
        transcriptId: 't-1',
        workflowRunId: 'run-1',
        status: 'SUCCESS',
        summaryText: 'Locked transaction test summary',
      });

      expect(res.success).toBe(true);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(transcriptsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 't-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(workflowRunsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('returns existing summary idempotently when duplicate callback is repeated on SUCCESS with matching summary', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        createdBy: mockSalesUser1.id,
        processingStatus: TranscriptProcessingStatus.COMPLETED,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.SUCCESS,
      });
      summariesRepository.findOne.mockResolvedValue({
        id: 'existing-summary-uuid',
        summaryText: 'Client agreed to upgrade to enterprise plan.',
        actionItems: [{ id: 'item-1', title: 'Existing Item' }],
      });

      const res = await service.handleCallback({
        transcriptId: 't-1',
        workflowRunId: 'run-1',
        status: 'SUCCESS',
        summaryText: 'Client agreed to upgrade to enterprise plan.',
      });

      expect(res.success).toBe(true);
      expect(res.summaryId).toBe('existing-summary-uuid');
      expect(res.actionItemCount).toBe(1);
    });

    it('returns existing failure idempotently when duplicate callback is repeated on FAILED with matching error', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        createdBy: mockSalesUser1.id,
        processingStatus: TranscriptProcessingStatus.FAILED,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.FAILED,
        errorMessage: 'Gemini rate limit exceeded',
      });

      const res = await service.handleCallback({
        transcriptId: 't-1',
        workflowRunId: 'run-1',
        status: 'FAILED',
        errorMessage: 'Gemini rate limit exceeded',
      });

      expect(res.success).toBe(false);
      expect(res.errorMessage).toBe('Gemini rate limit exceeded');
    });

    it('throws ConflictException (409) when duplicate SUCCESS arrives with conflicting summary', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        processingStatus: TranscriptProcessingStatus.COMPLETED,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.SUCCESS,
      });
      summariesRepository.findOne.mockResolvedValue({
        id: 'existing-summary-uuid',
        summaryText: 'Original summary text.',
      });

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
          summaryText: 'Conflicting summary text completely different.',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException (409) when duplicate FAILED arrives with conflicting errorMessage', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        processingStatus: TranscriptProcessingStatus.FAILED,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.FAILED,
        errorMessage: 'Original error: Connection timeout',
      });

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'run-1',
          status: 'FAILED',
          errorMessage: 'Conflicting error: Out of memory',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException (409) when late FAILED callback arrives for an already COMPLETED/SUCCESS run', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        processingStatus: TranscriptProcessingStatus.COMPLETED,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.SUCCESS,
      });

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'run-1',
          status: 'FAILED',
          errorMessage: 'Late failure trying to downgrade completed run',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException (409) when late SUCCESS callback arrives for an already FAILED run', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
        processingStatus: TranscriptProcessingStatus.FAILED,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.FAILED,
        errorMessage: 'Initial failure',
      });

      await expect(
        service.handleCallback({
          transcriptId: 't-1',
          workflowRunId: 'run-1',
          status: 'SUCCESS',
          summaryText: 'Late success trying to overwrite failed run',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('saveInternalActionItems deduplication', () => {
    it('deduplicates action items with existing titles (case-insensitive)', async () => {
      summariesRepository.findOne.mockResolvedValue({
        id: 'summary-1',
        transcript: { createdBy: mockSalesUser1.id },
      });
      actionItemsRepository.find.mockResolvedValue([
        { id: 'item-1', title: 'Follow up with stakeholder' },
      ]);

      const res = await service.saveInternalActionItems('summary-1', {
        actionItems: [
          { title: 'Follow up with stakeholder' }, // duplicate
          { title: '  follow up with STAKEHOLDER  ' }, // duplicate with whitespace/case
          { title: 'New unique action item' }, // new
        ],
      });

      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(actionItemsRepository.save).toHaveBeenCalledTimes(1);
      expect(actionItemsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New unique action item' }),
      );
    });
  });

  describe('updateActionItem authorization', () => {
    it('prevents non-owner sales user from approving/rejecting action item', async () => {
      actionItemsRepository.findOne.mockResolvedValue({
        id: 'item-1',
        summary: {
          transcript: {
            createdBy: 'owner-id',
            lead: { ownerId: 'owner-id' },
            customer: null,
          },
        },
        assignedTo: mockSalesUser1.id,
        approvalState: ActionItemApprovalState.PROPOSED,
      });

      await expect(
        service.updateActionItem(
          'item-1',
          { approvalState: ActionItemApprovalState.APPROVED },
          mockSalesUser1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents non-owner sales user from reassigning action item', async () => {
      actionItemsRepository.findOne.mockResolvedValue({
        id: 'item-1',
        summary: {
          transcript: {
            createdBy: 'owner-id',
            lead: { ownerId: 'owner-id' },
            customer: null,
          },
        },
        assignedTo: mockSalesUser1.id,
      });

      await expect(
        service.updateActionItem(
          'item-1',
          { assignedTo: mockSalesUser2.id },
          mockSalesUser1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assignee to update status', async () => {
      const mockItem = {
        id: 'item-1',
        summary: {
          transcript: {
            createdBy: 'owner-id',
            lead: { ownerId: 'owner-id' },
            customer: null,
          },
        },
        assignedTo: mockSalesUser1.id,
        status: ActionItemStatus.PENDING,
      };
      actionItemsRepository.findOne.mockResolvedValue(mockItem);

      await service.updateActionItem(
        'item-1',
        { status: ActionItemStatus.IN_PROGRESS },
        mockSalesUser1,
      );

      expect(actionItemsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ActionItemStatus.IN_PROGRESS }),
      );
    });

    it('allows admin to approve, reassign and modify details', async () => {
      const mockItem = {
        id: 'item-1',
        summary: {
          transcript: {
            createdBy: 'owner-id',
            lead: { ownerId: 'owner-id' },
            customer: null,
          },
        },
        assignedTo: mockSalesUser1.id,
        approvalState: ActionItemApprovalState.PROPOSED,
      };
      actionItemsRepository.findOne.mockResolvedValue(mockItem);
      usersRepository.findOne.mockResolvedValue({
        id: mockSalesUser2.id,
        status: UserStatus.ACTIVE,
      });

      await service.updateActionItem(
        'item-1',
        {
          approvalState: ActionItemApprovalState.APPROVED,
          assignedTo: mockSalesUser2.id,
          title: 'Admin renamed action item',
        },
        mockAdminUser,
      );

      expect(actionItemsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalState: ActionItemApprovalState.APPROVED,
          assignedTo: mockSalesUser2.id,
          title: 'Admin renamed action item',
        }),
      );
    });
  });

  describe('atomic ingestion and durable outbox boundary', () => {
    it('atomically persists WorkflowRun, ConversationTranscript and enqueues OutboxEvent in one transaction', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });

      const result = await service.createTranscript(
        {
          customerId: 'customer-1',
          content: 'Discussed renewal contract terms with client.',
          sourceType: 'CALL',
        },
        mockSalesUser1,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(workflowRunsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 't12-wf09-conversation-summarizer',
          status: WorkflowStatus.PENDING,
          customerId: 'customer-1',
          triggeredByUserId: mockSalesUser1.id,
        }),
      );
      expect(transcriptsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowRunId: 'run-uuid',
          sourceType: 'CALL',
          redactionMode: 'PII_REDACTION+backend',
        }),
      );
      expect(dispatcher.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'N8N_WF09_WEBHOOK_URL',
        'internal/t12-wf09-conversation-summarizer',
        expect.objectContaining({
          transcriptId: 'transcript-uuid',
          workflowRunId: 'run-uuid',
          customerId: 'customer-1',
          sourceType: 'CALL',
          createdBy: mockSalesUser1.id,
        }),
      );
      expect(result).toMatchObject({
        transcriptId: 'transcript-uuid',
        workflowRunId: 'run-uuid',
        processingStatus: WorkflowStatus.PENDING,
      });
    });

    it('fault injection: rolls back transaction and throws when outbox enqueue fails, leaving no orphaned records', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });
      dispatcher.enqueue.mockRejectedValueOnce(
        new Error('Outbox write failure: broker unavailable'),
      );

      await expect(
        service.createTranscript(
          {
            customerId: 'customer-1',
            content: 'Discussed renewal terms.',
          },
          mockSalesUser1,
        ),
      ).rejects.toThrow('Outbox write failure: broker unavailable');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('fault injection: rolls back transaction when database persistence fails before outbox enqueue', async () => {
      customersRepository.findOne.mockResolvedValue({
        id: 'customer-1',
        createdBy: mockSalesUser1.id,
      });
      workflowRunsRepository.save.mockRejectedValueOnce(
        new Error('Database write error: disk full'),
      );

      await expect(
        service.createTranscript(
          {
            customerId: 'customer-1',
            content: 'Discussed renewal terms.',
          },
          mockSalesUser1,
        ),
      ).rejects.toThrow('Database write error: disk full');

      expect(dispatcher.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('human confirmation gate enforcement for AI action items', () => {
    it('ignores AI-supplied approvalState and status in handleCallback, unconditionally forcing PROPOSED and PENDING_CONFIRMATION', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        workflowRunId: 'run-1',
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        workflowName: 't12-wf09-conversation-summarizer',
        status: WorkflowStatus.RUNNING,
        triggeredByUserId: mockSalesUser1.id,
      });

      const res = await service.handleCallback({
        transcriptId: 't-1',
        workflowRunId: 'run-1',
        status: 'SUCCESS',
        summaryText: 'Meeting summary discussion',
        actionItems: [
          {
            title: 'Deploy contract to production',
            status: 'COMPLETED', // Attacker / AI attempts to bypass confirmation
            approvalState: 'APPROVED', // Attacker / AI attempts to bypass confirmation
            confidence: 0.99,
          },
          {
            title: 'Reject vendor proposal',
            status: 'REJECTED',
            approvalState: 'REJECTED',
            confidence: 0.95,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.actionItemCount).toBe(2);

      // Verify that manager.create was called with requiresConfirmation: true and status: 'PENDING_CONFIRMATION'
      // Regardless of the incoming AI values
      const managerTransaction = dataSource.transaction.mock.calls[0][0];
      const savedActionItems: any[] = [];
      const mockManager = {
        findOne: jest.fn((entity: any) => {
          if (entity === ConversationTranscript) {
            return Promise.resolve({ id: 't-1', workflowRunId: 'run-1' });
          }
          if (entity === WorkflowRun) {
            return Promise.resolve({
              id: 'run-1',
              workflowName: 't12-wf09-conversation-summarizer',
              status: WorkflowStatus.RUNNING,
              triggeredByUserId: mockSalesUser1.id,
            });
          }
          if (entity === ConversationSummary) {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        }),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((entity: any, dto: any) => {
          if (entity === ConversationActionItem) {
            savedActionItems.push(dto);
          }
          return { ...dto, id: 'item-uuid' };
        }),
        save: jest.fn((entity: any) =>
          Promise.resolve({ ...entity, id: entity.id || 'saved-uuid' }),
        ),
      };

      await managerTransaction(mockManager);

      expect(savedActionItems.length).toBe(2);
      for (const item of savedActionItems) {
        expect(item.status).toBe('PENDING_CONFIRMATION');
        expect(item.requiresConfirmation).toBe(true);
      }
    });

    it('ignores incoming approvalState and status in saveInternalActionItems, forcing PENDING_CONFIRMATION and requiresConfirmation: true', async () => {
      summariesRepository.findOne.mockResolvedValue({
        id: 'summary-1',
        workflowRunId: 'run-1',
        transcript: { createdBy: mockSalesUser1.id },
      });
      actionItemsRepository.find.mockResolvedValue([]);

      const res = await service.saveInternalActionItems('summary-1', {
        actionItems: [
          {
            title: 'Sign enterprise agreement',
            status: 'COMPLETED',
            approvalState: 'APPROVED',
            confidence: 0.98,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(actionItemsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sign enterprise agreement',
          status: 'PENDING_CONFIRMATION',
          requiresConfirmation: true,
        }),
      );
    });
  });
});
