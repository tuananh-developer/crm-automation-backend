import { ConflictException } from '@nestjs/common';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import type { DataSource, Repository } from 'typeorm';
import { SalesMeetingsService } from './sales-meetings.service.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import type { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { Customer } from '../customers/entities/customer.entity.js';
import type { User } from '../users/entities/user.entity.js';
import type { SalesMeeting } from './entities/sales-meeting.entity.js';
import type { ConversationTranscript } from './entities/conversation-transcript.entity.js';
import type { ConversationSummary } from './entities/conversation-summary.entity.js';
import type { ConversationActionItem } from './entities/conversation-action-item.entity.js';
import type {
  SaveConversationTranscriptDto,
  SaveMeetingSummaryDto,
  SaveMeetingActionItemsDto,
  ConfirmMeetingActionItemDto,
  NotifyMeetingDto,
  StartSalesMeetingDto,
} from './dto/index.js';

describe('SalesMeetingsService persistence idempotency', () => {
  const meeting = {
    id: 'meeting-1',
    workflowRunId: 'run-1',
    ownerId: 'owner-1',
    leadId: null,
    customerId: 'customer-1',
    attendeeIds: ['attendee-1'],
    transcriptId: null,
    summaryId: null,
  } as SalesMeeting;
  const workflowRun = {
    id: 'run-1',
    workflowName: 'T12-WF11_SALES_MEETING',
    status: WorkflowStatus.RUNNING,
  } as WorkflowRun;

  let service: SalesMeetingsService;
  let repositories: Record<string, any>;
  let dataSource: { transaction: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let dispatcher: { enqueue: jest.Mock };

  beforeEach(() => {
    const makeRepository = (id: string) => ({
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve({ id, ...input })),
      find: jest.fn().mockResolvedValue([]),
    });

    repositories = {
      WorkflowRun: makeRepository('run-1'),
      Lead: makeRepository('lead-1'),
      Customer: makeRepository('customer-1'),
      User: makeRepository('user-1'),
      SalesMeeting: makeRepository('meeting-1'),
      ConversationTranscript: makeRepository('transcript-1'),
      ConversationSummary: makeRepository('summary-1'),
      ConversationActionItem: makeRepository('action-1'),
      Notification: makeRepository('notification-1'),
      OutboxEvent: makeRepository('outbox-1'),
    };

    manager = {
      getRepository: jest.fn((entity: { name: string }) => repositories[entity.name]),
    };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    };

    dispatcher = { enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1' }) };

    service = new SalesMeetingsService(
      repositories.WorkflowRun as Repository<WorkflowRun>,
      repositories.Lead as Repository<Lead>,
      repositories.Customer as Repository<Customer>,
      repositories.User as Repository<User>,
      repositories.SalesMeeting as Repository<SalesMeeting>,
      repositories.ConversationTranscript as Repository<ConversationTranscript>,
      repositories.ConversationSummary as Repository<ConversationSummary>,
      repositories.ConversationActionItem as Repository<ConversationActionItem>,
      dataSource as unknown as DataSource,
      dispatcher,
    );
  });

  const transcriptDto: SaveConversationTranscriptDto = {
    meetingId: 'meeting-1',
    workflowRunId: 'run-1',
    sourceType: 'MEETING_TRANSCRIPT',
    transcript: 'We discussed the enterprise proposal and next steps for delivery.',
    redactionMode: 'N8N',
    idempotencyKey: 'run-1',
  };

  it('saves the redacted transcript and meeting reference in one transaction', async () => {
    repositories.SalesMeeting.findOne.mockResolvedValue({ ...meeting });
    repositories.WorkflowRun.findOne.mockResolvedValue({ ...workflowRun });

    const result = await service.saveTranscript(transcriptDto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repositories.ConversationTranscript.save).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: 'meeting-1',
        workflowRunId: 'run-1',
        idempotencyKey: 'wf11:run-1:transcript',
        redactedText: expect.any(String),
      }),
    );
    expect(repositories.SalesMeeting.save).toHaveBeenCalledWith(
      expect.objectContaining({ transcriptId: 'transcript-1' }),
    );
    expect(result).toMatchObject({
      id: 'transcript-1',
      workflowRunId: 'run-1',
      redacted: true,
      reused: false,
    });
  });

  it('rejects a transcript idempotency key reused with different content', async () => {
    repositories.SalesMeeting.findOne.mockResolvedValue({ ...meeting });
    repositories.WorkflowRun.findOne.mockResolvedValue({ ...workflowRun });
    repositories.ConversationTranscript.findOne.mockResolvedValue({
      id: 'transcript-existing',
      meetingId: 'meeting-1',
      workflowRunId: 'run-1',
      sourceType: 'MEETING_TRANSCRIPT',
      contentHash: 'not-the-request-hash',
    });

    await expect(service.saveTranscript(transcriptDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repositories.ConversationTranscript.save).not.toHaveBeenCalled();
  });

  it('saves the summary and meeting reference atomically', async () => {
    repositories.SalesMeeting.findOne.mockResolvedValue({
      ...meeting,
      transcriptId: 'transcript-1',
    });
    repositories.WorkflowRun.findOne.mockResolvedValue({ ...workflowRun });
    repositories.ConversationTranscript.findOne.mockResolvedValue({
      id: 'transcript-1',
      meetingId: 'meeting-1',
      workflowRunId: 'run-1',
    });

    const dto: SaveMeetingSummaryDto = {
      workflowRunId: 'run-1',
      transcriptId: 'transcript-1',
      summary: 'Customer agreed to review the proposal.',
      decisions: [],
      risks: [],
      idempotencyKey: 'run-1',
    };
    const result = await service.saveSummary('meeting-1', dto);

    expect(repositories.ConversationSummary.save).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: 'meeting-1',
        transcriptId: 'transcript-1',
        workflowRunId: 'run-1',
      }),
    );
    expect(repositories.SalesMeeting.save).toHaveBeenCalledWith(
      expect.objectContaining({ summaryId: 'summary-1' }),
    );
    expect(result).toMatchObject({
      id: 'summary-1',
      meetingId: 'meeting-1',
      workflowRunId: 'run-1',
      reused: false,
    });
  });

  it('rejects reuse of a summary workflow key with a different summary', async () => {
    repositories.SalesMeeting.findOne.mockResolvedValue({
      ...meeting,
      transcriptId: 'transcript-1',
      summaryId: 'summary-existing',
    });
    repositories.WorkflowRun.findOne.mockResolvedValue({ ...workflowRun });
    repositories.ConversationTranscript.findOne.mockResolvedValue({
      id: 'transcript-1',
      meetingId: 'meeting-1',
      workflowRunId: 'run-1',
    });
    repositories.ConversationSummary.findOne.mockResolvedValue({
      id: 'summary-existing',
      transcriptId: 'transcript-1',
      summary: 'Different saved summary',
      decisions: [],
      risks: [],
    });

    await expect(
      service.saveSummary('meeting-1', {
        workflowRunId: 'run-1',
        transcriptId: 'transcript-1',
        summary: 'Another summary payload',
        decisions: [],
        risks: [],
        idempotencyKey: 'run-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reuses an already confirmed action item when the same action payload is retried', async () => {
    repositories.ConversationSummary.findOne.mockResolvedValue({
      id: 'summary-1',
      workflowRunId: 'run-1',
      meetingId: 'meeting-1',
    });
    repositories.SalesMeeting.findOne.mockResolvedValue({ ...meeting });
    repositories.ConversationActionItem.findOne.mockResolvedValue({
      id: 'action-existing',
      summaryId: 'summary-1',
      workflowRunId: 'run-1',
      title: 'Send proposal',
      description: null,
      ownerAttendeeId: 'attendee-1',
      dueDate: null,
      evidence: null,
      confidence: 0.9,
      requiresConfirmation: false,
      status: 'CONFIRMED',
    });

    const dto: SaveMeetingActionItemsDto = {
      workflowRunId: 'run-1',
      idempotencyKey: 'run-1',
      actionItems: [{
        title: 'Send proposal',
        ownerAttendeeId: 'attendee-1',
        confidence: 0.9,
        requiresConfirmation: true,
      }],
    };
    const result = await service.saveActionItems('summary-1', dto);

    expect(repositories.ConversationActionItem.save).not.toHaveBeenCalled();
    expect(result.actionItems).toEqual([{
      id: 'action-existing',
      title: 'Send proposal',
      status: 'CONFIRMED',
      requiresConfirmation: false,
    }]);
  });

  it('rejects action item idempotency keys reused with changed action content', async () => {
    repositories.ConversationSummary.findOne.mockResolvedValue({
      id: 'summary-1',
      workflowRunId: 'run-1',
      meetingId: 'meeting-1',
    });
    repositories.SalesMeeting.findOne.mockResolvedValue({ ...meeting });
    repositories.ConversationActionItem.findOne.mockResolvedValue({
      id: 'action-existing',
      summaryId: 'summary-1',
      workflowRunId: 'run-1',
      title: 'Old title',
      description: null,
      ownerAttendeeId: null,
      dueDate: null,
      evidence: null,
      confidence: 0.9,
    });

    await expect(
      service.saveActionItems('summary-1', {
        workflowRunId: 'run-1',
        idempotencyKey: 'run-1',
        actionItems: [{
          title: 'Changed title',
          confidence: 0.9,
          requiresConfirmation: true,
        }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes action-item confirmation and rejects a second concurrent decision', async () => {
    repositories.ConversationActionItem.findOne.mockResolvedValue({
      id: 'action-1',
      summaryId: 'summary-1',
      status: 'PENDING_CONFIRMATION',
      requiresConfirmation: true,
      confirmedBy: null,
      confirmationNote: null,
    });
    repositories.ConversationSummary.findOne.mockResolvedValue({
      id: 'summary-1',
      meetingId: 'meeting-1',
    });
    repositories.SalesMeeting.findOne.mockResolvedValue({ ...meeting });

    const actor: AuthenticatedUser = {
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const dto: ConfirmMeetingActionItemDto = {
      decision: 'CONFIRM',
      comment: 'Approved',
    };
    const result = await service.confirmActionItem('action-1', dto, actor);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repositories.ConversationActionItem.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'action-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(repositories.ConversationActionItem.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'CONFIRMED',
        requiresConfirmation: false,
        confirmedBy: 'owner-1',
        confirmationNote: 'Approved',
      }),
    );
    expect(result).toMatchObject({
      id: 'action-1',
      status: 'CONFIRMED',
      confirmedBy: 'owner-1',
    });
  });

  it('commits meeting notifications and terminal workflow state in one transaction', async () => {
    repositories.SalesMeeting.findOne.mockResolvedValue({
      ...meeting,
      summaryId: 'summary-1',
      notificationSentAt: null,
    });
    repositories.WorkflowRun.findOne.mockResolvedValue({
      ...workflowRun,
      status: WorkflowStatus.RUNNING,
      outputPayload: {},
    });
    repositories.ConversationSummary.findOne.mockResolvedValue({
      id: 'summary-1',
      meetingId: 'meeting-1',
      workflowRunId: 'run-1',
    });
    repositories.Notification.find.mockResolvedValue([]);

    const dto: NotifyMeetingDto = {
      meetingId: 'meeting-1',
      workflowRunId: 'run-1',
      summaryId: 'summary-1',
      attendeeIds: ['attendee-1'],
      idempotencyKey: 'run-1',
    };
    const result = await service.notify(dto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repositories.Notification.save).toHaveBeenCalledTimes(2);
    expect(repositories.SalesMeeting.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        notificationSentAt: expect.any(Date),
      }),
    );
    expect(repositories.WorkflowRun.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: WorkflowStatus.SUCCESS,
        finishedAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      meetingId: 'meeting-1',
      summaryId: 'summary-1',
      notifiedUserIds: ['owner-1', 'attendee-1'],
      reused: false,
    });
  });


  it('creates the meeting and its n8n dispatch intent in the same transaction', async () => {
    repositories.WorkflowRun.findOne.mockResolvedValue(null);
    repositories.Lead.findOne.mockResolvedValue({
      id: 'lead-1',
      ownerId: 'owner-1',
    });
    repositories.User.find.mockResolvedValue([]);

    const dto: StartSalesMeetingDto = {
      leadId: 'lead-1',
      attendeeIds: [],
      transcript:
        'The customer reviewed the enterprise proposal and agreed to the next delivery steps.',
      sourceType: 'MEETING_TRANSCRIPT',
    };
    const actor: AuthenticatedUser = {
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await service.request(dto, actor, 'meeting-key-0001');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repositories.WorkflowRun.save).toHaveBeenCalled();
    expect(repositories.SalesMeeting.save).toHaveBeenCalled();
    expect(dispatcher.enqueue).toHaveBeenCalledWith(
      manager,
      'N8N_WF11_WEBHOOK_URL',
      'internal/t12-wf11-sales-meeting',
      expect.objectContaining({
        meetingId: 'meeting-1',
        workflowRunId: 'run-1',
        requestedBy: 'owner-1',
      }),
    );
    expect(result).toMatchObject({
      workflowRunId: 'run-1',
      meetingId: 'meeting-1',
      status: WorkflowStatus.PENDING,
      reused: false,
    });
  });

});
