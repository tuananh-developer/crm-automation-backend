import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';
import { Lead } from '../leads/entities/lead.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { N8nWorkflowDispatchService } from './n8n-workflow-dispatch.service.js';
import { hasSamePayload, isPostgresUniqueViolation } from '../../common/utils/idempotency.util.js';
import { SalesMeeting } from './entities/sales-meeting.entity.js';
import { ConversationTranscript } from './entities/conversation-transcript.entity.js';
import { ConversationSummary } from './entities/conversation-summary.entity.js';
import { ConversationActionItem } from './entities/conversation-action-item.entity.js';
import {
  ConfirmMeetingActionItemDto,
  NotifyMeetingDto,
  SaveConversationTranscriptDto,
  SaveMeetingActionItemsDto,
  SaveMeetingSummaryDto,
  StartSalesMeetingDto,
} from './dto/index.js';
import { redactMeetingTranscript } from './utils/transcript-redaction.util.js';

export const WF11_NAME = 'T12-WF11_SALES_MEETING';

@Injectable()
export class SalesMeetingsService {
  constructor(
    @InjectRepository(WorkflowRun)
    private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(SalesMeeting)
    private readonly meetings: Repository<SalesMeeting>,
    @InjectRepository(ConversationTranscript)
    private readonly transcripts: Repository<ConversationTranscript>,
    @InjectRepository(ConversationSummary)
    private readonly summaries: Repository<ConversationSummary>,
    @InjectRepository(ConversationActionItem)
    private readonly actionItems: Repository<ConversationActionItem>,
    private readonly dataSource: DataSource,
    private readonly dispatcher: N8nWorkflowDispatchService,
  ) {}

  private requireKey(key?: string): string {
    if (!key || key.length < 8 || key.length > 180)
      throw new BadRequestException('Idempotency-Key header is required');
    return key;
  }

  async request(dto: StartSalesMeetingDto, actor: AuthenticatedUser, rawKey?: string) {
    const key = 'WF11:' + actor.id + ':' + this.requireKey(rawKey);
    const safeTranscript = redactMeetingTranscript(dto.transcript);
    if (safeTranscript.length < 20 || safeTranscript.length > 120000) throw new BadRequestException('Redacted transcript must contain 20..120000 characters');
    const transcriptHash = createHash('sha256').update(safeTranscript).digest('hex');
    if (Boolean(dto.leadId) === Boolean(dto.customerId)) throw new BadRequestException('Exactly one of leadId or customerId is required');
    let lead: Lead | null = null; let customer: Customer | null = null;
    if (dto.leadId) {
      lead = await this.leads.findOne({ where: { id: dto.leadId } });
      if (!lead || (actor.role !== UserRole.ADMIN && lead.ownerId !== actor.id)) throw new NotFoundException('Lead not found');
    } else {
      customer = await this.customers.findOne({ where: { id: dto.customerId! } });
      if (!customer || (actor.role !== UserRole.ADMIN && customer.createdBy !== actor.id)) throw new NotFoundException('Customer not found');
    }
    const attendees = dto.attendeeIds.length ? await this.users.find({ where: { id: In(dto.attendeeIds), status: UserStatus.ACTIVE }, select: { id: true } }) : [];
    if (attendees.length !== dto.attendeeIds.length) throw new BadRequestException('All attendeeIds must reference active users');
    const inputPayload = { leadId: lead?.id ?? null, customerId: customer?.id ?? null, attendeeIds: [...dto.attendeeIds].sort(), meetingPurpose: dto.meetingPurpose ?? null, scheduledAt: dto.scheduledAt ?? null, sourceType: dto.sourceType ?? 'MEETING_TRANSCRIPT', transcriptHash };
    const reuseExisting = (existing: WorkflowRun) => {
      if (existing.workflowName !== WF11_NAME) throw new ConflictException('Idempotency key is already used by another workflow');
      if (!hasSamePayload(existing.inputPayload, inputPayload)) throw new ConflictException('Idempotency key was already used with a different meeting payload');
      return { workflowRunId: existing.id, meetingId: (existing.outputPayload?.meetingId as string) ?? null, status: existing.status, reused: true };
    };
    const existing = await this.runs.findOne({ where: { idempotencyKey: key } });
    if (existing) return reuseExisting(existing);
    let saved: { run: WorkflowRun; meeting: SalesMeeting };
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const runRepo = manager.getRepository(WorkflowRun); const meetingRepo = manager.getRepository(SalesMeeting);
        const run = await runRepo.save(runRepo.create({ workflowName: WF11_NAME, idempotencyKey: key, leadId: lead?.id ?? null, customerId: customer?.id ?? null, triggeredByUserId: actor.id, status: WorkflowStatus.PENDING, inputPayload, outputPayload: null, errorMessage: null, startedAt: new Date(), finishedAt: null }));
        const meetingRecord = meetingRepo.create({ workflowRunId: run.id, ownerId: actor.id, leadId: lead?.id ?? null, customerId: customer?.id ?? null, attendeeIds: dto.attendeeIds, meetingPurpose: dto.meetingPurpose ?? null, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null, sourceType: dto.sourceType ?? 'MEETING_TRANSCRIPT', status: 'PROCESSING', transcriptId: null, summaryId: null, notificationSentAt: null });
        const meeting = await meetingRepo.save(meetingRecord);
        run.outputPayload = { meetingId: meeting.id }; await runRepo.save(run);
        return { run, meeting };
      });
    } catch (error) {
      if (!isPostgresUniqueViolation(error)) throw error;
      const concurrent = await this.runs.findOne({ where: { idempotencyKey: key } });
      if (!concurrent) throw error;
      return reuseExisting(concurrent);
    }
    try {
      await this.dispatcher.dispatch('N8N_WF11_WEBHOOK_URL', 'internal/t12-wf11-sales-meeting', { meetingId: saved.meeting.id, workflowRunId: saved.run.id, attendeeIds: dto.attendeeIds, meetingPurpose: dto.meetingPurpose ?? null, transcript: safeTranscript, sourceType: dto.sourceType ?? 'MEETING_TRANSCRIPT', requestedBy: actor.id, idempotencyKey: saved.run.id });
      // The n8n callback can finish before the HTTP webhook acknowledgement.
      await this.runs.update(
        { id: saved.run.id, status: WorkflowStatus.PENDING },
        { status: WorkflowStatus.RUNNING },
      );
      const latest = await this.runs.findOne({ where: { id: saved.run.id } });
      return {
        workflowRunId: saved.run.id,
        meetingId: saved.meeting.id,
        status: latest?.status ?? WorkflowStatus.RUNNING,
        reused: false,
      };
    } catch (error) {
      await this.runs.update(
        { id: saved.run.id, status: In([WorkflowStatus.PENDING, WorkflowStatus.RUNNING]) },
        {
          status: WorkflowStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'Dispatch failed',
        },
      );
      const latest = await this.runs.findOne({ where: { id: saved.run.id } });
      if (latest && [WorkflowStatus.SUCCESS, WorkflowStatus.PARTIAL].includes(latest.status)) {
        return {
          workflowRunId: saved.run.id,
          meetingId: saved.meeting.id,
          status: latest.status,
          reused: false,
        };
      }
      // Do not mark the meeting FAILED if a callback already completed the run.
      if (latest?.status === WorkflowStatus.FAILED) {
        await this.meetings.update({ id: saved.meeting.id }, { status: 'FAILED' });
      }
      throw error instanceof ServiceUnavailableException ? error : new ServiceUnavailableException('Unable to dispatch Sales Meeting workflow');
    }
  }

  private async getMeetingRunForUpdate(
    manager: EntityManager,
    meetingId: string,
    workflowRunId: string,
  ): Promise<{ meeting: SalesMeeting; run: WorkflowRun }> {
    const meeting = await manager.getRepository(SalesMeeting).findOne({
      where: { id: meetingId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!meeting || meeting.workflowRunId !== workflowRunId) {
      throw new NotFoundException('Sales meeting not found');
    }

    const run = await manager.getRepository(WorkflowRun).findOne({
      where: { id: workflowRunId, workflowName: WF11_NAME },
      lock: { mode: 'pessimistic_write' },
    });
    if (!run) {
      throw new NotFoundException('Sales meeting WorkflowRun not found');
    }

    if (![WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(run.status)) {
      throw new ConflictException('WorkflowRun is not active');
    }
    return { meeting, run };
  }

  private async getMeetingRun(meetingId: string, workflowRunId?: string) {
    const meeting = await this.meetings.findOne({ where: { id: meetingId } });
    if (!meeting || (workflowRunId && meeting.workflowRunId !== workflowRunId))
      throw new NotFoundException('Sales meeting not found');
    const run = await this.runs.findOne({
      where: { id: meeting.workflowRunId, workflowName: WF11_NAME },
    });
    if (!run)
      throw new NotFoundException('Sales meeting WorkflowRun not found');
    return { meeting, run };
  }

  async getContext(meetingId: string) {
    const { meeting } = await this.getMeetingRun(meetingId);
    const [lead, customer, attendees] = await Promise.all([
      meeting.leadId
        ? this.leads.findOne({
            where: { id: meeting.leadId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              companyName: true,
              jobTitle: true,
            },
          })
        : Promise.resolve(null),
      meeting.customerId
        ? this.customers.findOne({
            where: { id: meeting.customerId },
            select: {
              id: true,
              name: true,
              email: true,
              companyName: true,
              jobTitle: true,
            },
          })
        : Promise.resolve(null),
      meeting.attendeeIds.length
        ? this.users.find({
            where: { id: In(meeting.attendeeIds) },
            select: { id: true, name: true, email: true, role: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      meeting: {
        id: meeting.id,
        workflowRunId: meeting.workflowRunId,
        meetingPurpose: meeting.meetingPurpose,
        scheduledAt: meeting.scheduledAt,
      },
      lead,
      customer,
      attendees,
    };
  }

  async saveTranscript(dto: SaveConversationTranscriptDto) {
    if (dto.idempotencyKey !== dto.workflowRunId) {
      throw new BadRequestException('idempotencyKey must equal workflowRunId');
    }

    const redactedText = redactMeetingTranscript(dto.transcript);
    const hash = createHash('sha256').update(redactedText).digest('hex');
    const idempotencyKey = `wf11:${dto.workflowRunId}:transcript`;

    return this.dataSource.transaction(async (manager) => {
      const { meeting, run } = await this.getMeetingRunForUpdate(
        manager,
        dto.meetingId,
        dto.workflowRunId,
      );
      const transcriptRepository = manager.getRepository(ConversationTranscript);
      const existing = await transcriptRepository.findOne({
        where: { idempotencyKey },
      });

      if (existing) {
        if (
          existing.workflowRunId !== run.id ||
          existing.meetingId !== meeting.id ||
          existing.contentHash !== hash ||
          existing.sourceType !== dto.sourceType
        ) {
          throw new ConflictException(
            'Transcript idempotency key was already used with different content',
          );
        }
        if (meeting.transcriptId && meeting.transcriptId !== existing.id) {
          throw new ConflictException(
            'Meeting already references a different transcript',
          );
        }
        if (!meeting.transcriptId) {
          meeting.transcriptId = existing.id;
          await manager.getRepository(SalesMeeting).save(meeting);
        }
        return {
          id: existing.id,
          workflowRunId: run.id,
          redacted: true,
          contentHash: hash,
          reused: true,
        };
      }

      const transcript = await transcriptRepository.save(
        transcriptRepository.create({
          meetingId: meeting.id,
          workflowRunId: run.id,
          sourceType: dto.sourceType,
          redactedText,
          redactionMode: `${dto.redactionMode}+backend`,
          contentHash: hash,
          idempotencyKey,
        }),
      );
      meeting.transcriptId = transcript.id;
      await manager.getRepository(SalesMeeting).save(meeting);

      return {
        id: transcript.id,
        workflowRunId: run.id,
        redacted: true,
        contentHash: hash,
        reused: false,
      };
    });
  }

  async saveSummary(meetingId: string, dto: SaveMeetingSummaryDto) {
    if (dto.idempotencyKey !== dto.workflowRunId) {
      throw new BadRequestException('idempotencyKey must equal workflowRunId');
    }

    return this.dataSource.transaction(async (manager) => {
      const { meeting, run } = await this.getMeetingRunForUpdate(
        manager,
        meetingId,
        dto.workflowRunId,
      );
      if (!meeting.transcriptId || meeting.transcriptId !== dto.transcriptId) {
        throw new ConflictException('Transcript must be saved before summary');
      }

      const transcript = await manager.getRepository(ConversationTranscript).findOne({
        where: {
          id: dto.transcriptId,
          workflowRunId: run.id,
          meetingId: meeting.id,
        },
      });
      if (!transcript) {
        throw new NotFoundException('Transcript not found for meeting');
      }

      const summaryRepository = manager.getRepository(ConversationSummary);
      const existing = await summaryRepository.findOne({
        where: { workflowRunId: run.id },
      });
      const payload = {
        transcriptId: transcript.id,
        summary: dto.summary,
        decisions: dto.decisions ?? [],
        risks: dto.risks ?? [],
      };

      if (existing) {
        const existingPayload = {
          transcriptId: existing.transcriptId,
          summary: existing.summary,
          decisions: existing.decisions ?? [],
          risks: existing.risks ?? [],
        };
        if (!hasSamePayload(existingPayload, payload)) {
          throw new ConflictException(
            'Summary idempotency key was already used with different content',
          );
        }
        if (meeting.summaryId && meeting.summaryId !== existing.id) {
          throw new ConflictException(
            'Meeting already references a different summary',
          );
        }
        if (!meeting.summaryId) {
          meeting.summaryId = existing.id;
          await manager.getRepository(SalesMeeting).save(meeting);
        }
        return {
          id: existing.id,
          meetingId,
          workflowRunId: run.id,
          reused: true,
        };
      }

      const summary = await summaryRepository.save(
        summaryRepository.create({
          meetingId,
          transcriptId: transcript.id,
          workflowRunId: run.id,
          summary: dto.summary,
          decisions: dto.decisions ?? [],
          risks: dto.risks ?? [],
        }),
      );
      meeting.summaryId = summary.id;
      await manager.getRepository(SalesMeeting).save(meeting);
      return {
        id: summary.id,
        meetingId,
        workflowRunId: run.id,
        reused: false,
      };
    });
  }

  async saveActionItems(summaryId: string, dto: SaveMeetingActionItemsDto) {
    if (dto.idempotencyKey !== dto.workflowRunId) {
      throw new BadRequestException('idempotencyKey must equal workflowRunId');
    }

    return this.dataSource.transaction(async (manager) => {
      const summaryRepository = manager.getRepository(ConversationSummary);
      const meetingRepository = manager.getRepository(SalesMeeting);
      const itemRepository = manager.getRepository(ConversationActionItem);
      const summary = await summaryRepository.findOne({
        where: { id: summaryId, workflowRunId: dto.workflowRunId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!summary) {
        throw new NotFoundException('Meeting summary not found');
      }

      const meeting = summary.meetingId
        ? await meetingRepository.findOne({
            where: { id: summary.meetingId },
          })
        : null;
      if (!meeting) {
        throw new NotFoundException('Meeting not found');
      }

      const attendeeSet = new Set(meeting.attendeeIds);
      const result: Array<{
        id: string;
        title: string;
        status: string;
        requiresConfirmation: boolean;
      }> = [];

      for (let i = 0; i < dto.actionItems.length; i++) {
        const input = dto.actionItems[i];
        if (input.ownerAttendeeId && !attendeeSet.has(input.ownerAttendeeId)) {
          throw new BadRequestException('Action item owner must be an attendee');
        }

        const idempotencyKey = `wf11:${dto.workflowRunId}:action:${i}`;
        const payload = {
          summaryId,
          workflowRunId: dto.workflowRunId,
          title: input.title,
          description: input.description ?? null,
          ownerAttendeeId: input.ownerAttendeeId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          evidence: input.evidence ?? null,
          confidence: input.confidence,
          requiresConfirmation: true,
        };

        let item = await itemRepository.findOne({
          where: { idempotencyKey },
        });
        if (item) {
          const existingPayload = {
            summaryId: item.summaryId,
            workflowRunId: item.workflowRunId,
            title: item.title,
            description: item.description,
            ownerAttendeeId: item.ownerAttendeeId,
            dueDate: item.dueDate,
            evidence: item.evidence,
            confidence: Number(item.confidence),
          };
          const comparablePayload = {
            summaryId: payload.summaryId,
            workflowRunId: payload.workflowRunId,
            title: payload.title,
            description: payload.description,
            ownerAttendeeId: payload.ownerAttendeeId,
            dueDate: payload.dueDate,
            evidence: payload.evidence,
            confidence: Number(payload.confidence),
          };
          if (
            !hasSamePayload(existingPayload, comparablePayload)
          ) {
            throw new ConflictException(
              'Action item idempotency key was already used with different content',
            );
          }
        } else {
          item = await itemRepository.save(
            itemRepository.create({
              ...payload,
              idempotencyKey,
              status: 'PENDING_CONFIRMATION',
            }),
          );
        }

        result.push({
          id: item.id,
          title: item.title,
          status: item.status,
          requiresConfirmation: item.requiresConfirmation,
        });
      }

      return {
        summaryId,
        workflowRunId: dto.workflowRunId,
        actionItems: result,
      };
    });
  }

  async getForUser(meetingId: string, actor: AuthenticatedUser) {
    const meeting = await this.meetings.findOne({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Sales meeting not found');
    const isParticipant =
      meeting.ownerId === actor.id || meeting.attendeeIds.includes(actor.id);
    if (actor.role !== UserRole.ADMIN && !isParticipant)
      throw new NotFoundException('Sales meeting not found');
    const [summary, transcript, actionItems] = await Promise.all([
      meeting.summaryId
        ? this.summaries.findOne({ where: { id: meeting.summaryId } })
        : Promise.resolve(null),
      meeting.transcriptId
        ? this.transcripts.findOne({
            where: { id: meeting.transcriptId },
            select: {
              id: true,
              sourceType: true,
              redactionMode: true,
              contentHash: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
      meeting.summaryId
        ? this.actionItems.find({
            where: { summaryId: meeting.summaryId },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([]),
    ]);
    return { meeting, transcript, summary, actionItems };
  }

  async confirmActionItem(
    actionItemId: string,
    dto: ConfirmMeetingActionItemDto,
    actor: AuthenticatedUser,
  ) {
    const item = await this.actionItems.findOne({
      where: { id: actionItemId },
    });
    if (!item) throw new NotFoundException('Meeting action item not found');
    const summary = await this.summaries.findOne({
      where: { id: item.summaryId },
    });
    const meeting = summary
      ? await this.meetings.findOne({ where: { id: summary.meetingId ?? '' } })
      : null;
    if (!meeting) throw new NotFoundException('Meeting not found');
    const isParticipant =
      meeting.ownerId === actor.id || meeting.attendeeIds.includes(actor.id);
    if (actor.role !== UserRole.ADMIN && !isParticipant)
      throw new NotFoundException('Meeting action item not found');
    if (item.status !== 'PENDING_CONFIRMATION')
      throw new ConflictException(
        'Meeting action item has already been confirmed or rejected',
      );
    item.status = dto.decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    item.requiresConfirmation = false;
    item.confirmedBy = actor.id;
    item.confirmationNote = dto.comment ?? null;
    await this.actionItems.save(item);
    return {
      id: item.id,
      summaryId: item.summaryId,
      status: item.status,
      confirmedBy: item.confirmedBy,
    };
  }

  async notify(dto: NotifyMeetingDto) {
    if (dto.idempotencyKey !== dto.workflowRunId)
      throw new BadRequestException('idempotencyKey must equal workflowRunId');
    const { meeting, run } = await this.getMeetingRun(
      dto.meetingId,
      dto.workflowRunId,
    );
    const summary = await this.summaries.findOne({
      where: { id: dto.summaryId, workflowRunId: run.id },
    });
    if (!summary || meeting.summaryId !== summary.id)
      throw new NotFoundException('Meeting summary not found');
    if (dto.attendeeIds.some((id) => !meeting.attendeeIds.includes(id)))
      throw new BadRequestException(
        'Notification recipients must be meeting attendees',
      );
    const recipientIds = [...new Set([meeting.ownerId, ...dto.attendeeIds])];
    const existing = await this.dataSource.getRepository(Notification).find({
      where: recipientIds.map((userId) => ({
        userId,
        idempotencyKey: `wf11:${run.id}:${userId}`,
      })),
    });
    const byUser = new Set(existing.map((item) => item.userId));
    for (const userId of recipientIds) {
      if (byUser.has(userId)) continue;
      await this.dataSource.getRepository(Notification).save(
        this.dataSource.getRepository(Notification).create({
          userId,
          type: NotificationType.MEETING_SUMMARY_AVAILABLE,
          title: 'Meeting summary available',
          content: `A meeting summary and action items are ready for review.`,
          leadId: meeting.leadId,
          customerId: meeting.customerId,
          reviewTaskId: null,
          isRead: false,
          readAt: null,
          idempotencyKey: `wf11:${run.id}:${userId}`,
        }),
      );
    }
    meeting.status = 'COMPLETED';
    meeting.notificationSentAt = meeting.notificationSentAt ?? new Date();
    run.status = WorkflowStatus.SUCCESS;
    run.finishedAt = new Date();
    run.outputPayload = {
      ...(run.outputPayload ?? {}),
      transcriptId: meeting.transcriptId,
      summaryId: summary.id,
      notificationsCreatedFor: recipientIds,
    };
    await Promise.all([this.meetings.save(meeting), this.runs.save(run)]);
    return {
      success: true,
      meetingId: meeting.id,
      summaryId: summary.id,
      notifiedUserIds: recipientIds,
      reused: existing.length === recipientIds.length,
    };
  }
}
