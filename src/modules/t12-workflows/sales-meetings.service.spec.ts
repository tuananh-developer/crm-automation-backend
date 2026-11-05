import { ConflictException } from '@nestjs/common';
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
import type { N8nWorkflowDispatchService } from './n8n-workflow-dispatch.service.js';
import type {
  SaveConversationTranscriptDto,
  SaveMeetingSummaryDto,
  SaveMeetingActionItemsDto,
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
    };

    manager = {
      getRepository: jest.fn((entity: { name: string }) => repositories[entity.name]),
    };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    };

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
      {} as N8nWorkflowDispatchService,
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
});
