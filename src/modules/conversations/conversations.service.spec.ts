/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ForbiddenException } from '@nestjs/common';
import { ConversationsService } from './conversations.service.js';
import { TranscriptProcessingStatus } from './entities/conversation-transcript.entity.js';
import {
  ActionItemApprovalState,
  ActionItemStatus,
} from './entities/conversation-action-item.entity.js';
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

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'N8N_INTERNAL_URL') return 'http://localhost:5678';
        if (key === 'N8N_API_KEY') return 'test-key';
        return null;
      }),
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
      configService,
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

    it('allows transcript creation for lead owned by sales user', async () => {
      leadsRepository.findOne.mockResolvedValue({
        id: 'lead-1',
        ownerId: mockSalesUser1.id,
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      } as any);

      const result = await service.createTranscript(
        {
          leadId: 'lead-1',
          content: 'Discussed renewal with STK: 1234567890.',
        },
        mockSalesUser1,
      );

      expect(result.transcriptId).toBe('transcript-uuid');
      expect(transcriptsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: mockSalesUser1.id,
          redactedContent: expect.stringContaining('[REDACTED_ACCOUNT]'),
        }),
      );
    });
  });

  describe('handleCallback', () => {
    it('marks transcript and workflowRun as FAILED when status is FAILED without requiring summaryText', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        processingStatus: TranscriptProcessingStatus.PENDING,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        status: WorkflowStatus.PENDING,
      });

      const res = await service.handleCallback({
        transcriptId: 't-1',
        workflowRunId: 'run-1',
        status: 'FAILED',
        errorMessage: 'Gemini rate limit exceeded',
      });

      expect(res.success).toBe(false);
      expect(transcriptsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          processingStatus: TranscriptProcessingStatus.FAILED,
        }),
      );
      expect(workflowRunsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: WorkflowStatus.FAILED,
          errorMessage: 'Gemini rate limit exceeded',
        }),
      );
    });

    it('persists summary and action items on SUCCESS', async () => {
      transcriptsRepository.findOne.mockResolvedValue({
        id: 't-1',
        createdBy: mockSalesUser1.id,
        sourceType: 'CALL',
        processingStatus: TranscriptProcessingStatus.PENDING,
      });
      workflowRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
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
      expect(res.summaryId).toBe('summary-uuid');
      expect(summariesRepository.save).toHaveBeenCalled();
      expect(actionItemsRepository.save).toHaveBeenCalled();
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
});
