import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { ConversationTranscript } from './entities/conversation-transcript.entity.js';
import { ConversationSummary } from './entities/conversation-summary.entity.js';
import {
  ActionItemApprovalState,
  ConversationActionItem,
} from './entities/conversation-action-item.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import {
  ConversationCallbackDto,
  CreateTranscriptDto,
  SaveInternalActionItemsDto,
  UpdateActionItemDto,
  UpdateInternalRedactedContentDto,
} from './dto/index.js';

export const WF09_NAME = 't12-wf09-conversation-summarizer';

export enum TranscriptProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

function extractDecisionSentiment(
  decisions: Array<Record<string, unknown>> | undefined,
): string | null {
  if (!Array.isArray(decisions) || decisions.length === 0) return null;
  const first = decisions[0];
  return first && typeof first['sentiment'] === 'string'
    ? first['sentiment']
    : null;
}

function extractDecisionIntent(
  decisions: Array<Record<string, unknown>> | undefined,
): string | null {
  if (!Array.isArray(decisions) || decisions.length === 0) return null;
  const first = decisions[0];
  return first && typeof first['intent'] === 'string' ? first['intent'] : null;
}

function extractDecisionKeyPoints(
  decisions: Array<Record<string, unknown>> | undefined,
): string[] {
  if (!Array.isArray(decisions)) return [];
  return decisions.map((d) => {
    if (d && typeof d['keyPoint'] === 'string') {
      return d['keyPoint'];
    }
    return JSON.stringify(d);
  });
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(ConversationTranscript)
    private readonly transcriptsRepository: Repository<ConversationTranscript>,
    @InjectRepository(ConversationSummary)
    private readonly summariesRepository: Repository<ConversationSummary>,
    @InjectRepository(ConversationActionItem)
    private readonly actionItemsRepository: Repository<ConversationActionItem>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunsRepository: Repository<WorkflowRun>,
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Deterministic PII minimization on conversation transcript text.
   */
  redactSensitiveContent(rawText: string): string {
    if (!rawText) return '';
    return (
      rawText
        // Email addresses
        .replace(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
          '[REDACTED_EMAIL]',
        )
        // 16-digit credit card sequences (e.g. 4111 2222 3333 4444)
        .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[REDACTED_CARD]')
        // International Bank Account Numbers (IBAN)
        .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, '[REDACTED_ACCOUNT]')
        // Bank account / account numbers preceded by labels (Vietnamese & English)
        .replace(
          /(?:(?:số\s*tài\s*khoản|tài\s*khoản(?:\s*ngân\s*hàng)?|số\s*tk|stk|account(?:\s*number)?|acc(?:\s*no|\s*#)?)\s*[:#.-]?\s*)([0-9]{6,20})/gi,
          (match, p1: string) => match.replace(p1, '[REDACTED_ACCOUNT]'),
        )
        // Phone numbers (e.g. +84 912345678, (028) 38234567, 090-123-4567)
        .replace(
          /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
          '[REDACTED_PHONE]',
        )
    );
  }

  /**
   * Validates whether the authenticated user has CRM ownership/permission
   * for the linked customer or lead.
   */
  private async validateEntityAccess(
    user: AuthenticatedUser,
    customerId?: string | null,
    leadId?: string | null,
    creatorId?: string | null,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (creatorId && creatorId === user.id) {
      return;
    }

    if (leadId) {
      const lead = await this.leadsRepository.findOne({
        where: { id: leadId },
      });
      if (!lead) {
        throw new NotFoundException(`Lead with ID ${leadId} not found`);
      }
      if (!lead.ownerId || lead.ownerId !== user.id) {
        throw new ForbiddenException(
          `You do not have permission to access Lead ${leadId}`,
        );
      }
    }

    if (customerId) {
      const customer = await this.customersRepository.findOne({
        where: { id: customerId },
      });
      if (!customer) {
        throw new NotFoundException(`Customer with ID ${customerId} not found`);
      }
      if (!customer.createdBy || customer.createdBy !== user.id) {
        throw new ForbiddenException(
          `You do not have permission to access Customer ${customerId}`,
        );
      }
    }
  }

  /**
   * Ingests a new conversation transcript and triggers AI Summarizer workflow (T12-WF09).
   */
  async createTranscript(dto: CreateTranscriptDto, user: AuthenticatedUser) {
    const rawContent = dto.rawTranscript || dto.content;
    if (!rawContent || !rawContent.trim()) {
      throw new BadRequestException('Transcript content cannot be empty');
    }

    if (!dto.customerId && !dto.leadId) {
      throw new BadRequestException(
        'At least one of customerId or leadId must be provided',
      );
    }

    await this.validateEntityAccess(user, dto.customerId, dto.leadId);

    const safeTranscript = this.redactSensitiveContent(rawContent);
    const contentHash = createHash('sha256')
      .update(safeTranscript)
      .digest('hex');
    const idempotencyKey = `wf09:${user.id}:${dto.idempotencyKey || randomUUID()}`;

    // Create WorkflowRun for execution tracking and correlation
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: WF09_NAME,
      status: WorkflowStatus.PENDING,
      leadId: dto.leadId || null,
      customerId: dto.customerId || null,
      triggeredByUserId: user.id,
      idempotencyKey,
      inputPayload: {
        sourceType: dto.sourceType || 'CALL',
        customerId: dto.customerId || null,
        leadId: dto.leadId || null,
        contentLength: safeTranscript.length,
      },
    });
    const savedRun = await this.workflowRunsRepository.save(workflowRun);

    const transcript = this.transcriptsRepository.create({
      meetingId: dto.meetingId || null,
      workflowRunId: savedRun.id,
      sourceType: dto.sourceType || 'CALL',
      redactedText: safeTranscript,
      redactionMode: 'PII_REDACTION+backend',
      contentHash,
      idempotencyKey,
    });
    const savedTranscript = await this.transcriptsRepository.save(transcript);

    // Asynchronously dispatch internal trigger to n8n
    this.dispatchToN8n(
      savedTranscript.id,
      savedRun.id,
      safeTranscript,
      savedTranscript.sourceType,
      dto.customerId,
      dto.leadId,
      user.id,
    ).catch((err: unknown) => {
      this.logger.warn(
        `Failed to dispatch T12-WF09 to n8n: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      message: 'Transcript ingested and AI summarization initiated',
      transcriptId: savedTranscript.id,
      workflowRunId: savedRun.id,
      processingStatus: savedRun.status,
      redactedContent: savedTranscript.redactedText,
      createdAt: savedTranscript.createdAt,
    };
  }

  private async dispatchToN8n(
    transcriptId: string,
    workflowRunId: string,
    redactedContent: string,
    sourceType: string,
    customerId?: string,
    leadId?: string,
    createdBy?: string,
  ) {
    const n8nBaseUrl =
      this.configService.get<string>('N8N_INTERNAL_URL') ||
      this.configService.get<string>('N8N_WEBHOOK_URL') ||
      'http://localhost:5678';
    const webhookPath = '/webhook/t12-wf09-conversation-summarizer';
    const url = `${n8nBaseUrl.replace(/\/+$/, '')}${webhookPath}`;

    const payload = {
      transcriptId,
      workflowRunId,
      customerId: customerId || null,
      leadId: leadId || null,
      sourceType,
      redactedContent,
      createdBy: createdBy || null,
      timestamp: new Date().toISOString(),
    };

    const apiKey =
      this.configService.get<string>('N8N_API_KEY') ||
      this.configService.get<string>('N8N_WEBHOOK_SECRET');

    if (!apiKey) {
      const message =
        'N8N_API_KEY is not configured; cannot securely dispatch to n8n (Fail-Closed)';
      this.logger.error(message);
      await this.workflowRunsRepository.update(workflowRunId, {
        status: WorkflowStatus.FAILED,
        errorMessage: message,
        finishedAt: new Date(),
      });
      throw new InternalServerErrorException(message);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const message = `n8n webhook returned HTTP ${response.status}: ${errorText.slice(0, 300)}`;
        this.logger.error(`Error dispatching T12-WF09: ${message}`);

        await this.workflowRunsRepository.update(workflowRunId, {
          status: WorkflowStatus.FAILED,
          errorMessage: message,
          finishedAt: new Date(),
        });
        return;
      }

      this.logger.log(
        `T12-WF09 successfully dispatched to n8n webhook: ${url}`,
      );
    } catch (err: unknown) {
      const message = `n8n dispatch failed: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error(`Error dispatching T12-WF09: ${message}`);

      await this.workflowRunsRepository.update(workflowRunId, {
        status: WorkflowStatus.FAILED,
        errorMessage: message,
        finishedAt: new Date(),
      });
    }
  }

  async getTranscript(id: string, user: AuthenticatedUser) {
    const transcript = await this.transcriptsRepository.findOne({
      where: { id },
    });
    if (!transcript) {
      throw new NotFoundException(`Transcript with ID ${id} not found`);
    }

    const workflowRun = await this.workflowRunsRepository.findOne({
      where: { id: transcript.workflowRunId },
    });

    await this.validateEntityAccess(
      user,
      workflowRun?.customerId,
      workflowRun?.leadId,
      workflowRun?.triggeredByUserId,
    );

    return {
      id: transcript.id,
      meetingId: transcript.meetingId,
      customerId: workflowRun?.customerId || null,
      leadId: workflowRun?.leadId || null,
      sourceType: transcript.sourceType,
      redactedText: transcript.redactedText,
      redactedContent: transcript.redactedText,
      processingStatus: workflowRun?.status || 'PENDING',
      status: workflowRun?.status || 'PENDING',
      createdBy: workflowRun?.triggeredByUserId || null,
      workflowRunId: transcript.workflowRunId,
      createdAt: transcript.createdAt,
    };
  }

  async getTranscriptSummary(transcriptId: string, user: AuthenticatedUser) {
    const transcript = await this.transcriptsRepository.findOne({
      where: { id: transcriptId },
    });
    if (!transcript) {
      throw new NotFoundException(
        `Transcript with ID ${transcriptId} not found`,
      );
    }

    const workflowRun = await this.workflowRunsRepository.findOne({
      where: { id: transcript.workflowRunId },
    });

    await this.validateEntityAccess(
      user,
      workflowRun?.customerId,
      workflowRun?.leadId,
      workflowRun?.triggeredByUserId,
    );

    const summary = await this.summariesRepository.findOne({
      where: { transcriptId },
    });

    const actionItems = summary
      ? await this.actionItemsRepository.find({
          where: { summaryId: summary.id },
        })
      : [];

    return {
      transcriptId: transcript.id,
      processingStatus: workflowRun?.status || 'PENDING',
      redactedContent: transcript.redactedText,
      sourceType: transcript.sourceType,
      summary: summary
        ? {
            id: summary.id,
            summaryText: summary.summary,
            summary: summary.summary,
            sentiment: extractDecisionSentiment(summary.decisions),
            intent: extractDecisionIntent(summary.decisions),
            keyPoints: extractDecisionKeyPoints(summary.decisions),
            actionItems: actionItems.map((item) => ({
              id: item.id,
              summaryId: item.summaryId,
              title: item.title,
              assignedTo: item.ownerAttendeeId,
              dueAt: item.dueDate,
              status: item.status,
              approvalState: item.requiresConfirmation
                ? ActionItemApprovalState.PROPOSED
                : item.status === 'REJECTED'
                  ? ActionItemApprovalState.REJECTED
                  : ActionItemApprovalState.APPROVED,
              createdAt: item.createdAt,
            })),
            createdAt: summary.createdAt,
          }
        : null,
    };
  }

  async handleCallback(dto: ConversationCallbackDto) {
    this.logger.log(
      `Received T12-WF09 callback for transcript ${dto.transcriptId}, status=${dto.status}`,
    );

    return await this.dataSource.transaction(async (manager) => {
      // 1. Pessimistic write lock on both Transcript and WorkflowRun within transaction
      const transcript = await manager.findOne(ConversationTranscript, {
        where: { id: dto.transcriptId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transcript) {
        throw new NotFoundException(`Transcript ${dto.transcriptId} not found`);
      }

      const workflowRun = await manager.findOne(WorkflowRun, {
        where: { id: dto.workflowRunId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!workflowRun) {
        throw new NotFoundException(
          `WorkflowRun ${dto.workflowRunId} not found`,
        );
      }

      // 2. Correlation checks
      if (
        transcript.workflowRunId &&
        transcript.workflowRunId !== workflowRun.id
      ) {
        throw new BadRequestException(
          'WorkflowRun ID does not match transcript correlation',
        );
      }

      if (workflowRun.workflowName !== WF09_NAME) {
        throw new BadRequestException(
          `WorkflowRun ${workflowRun.id} belongs to ${workflowRun.workflowName}, expected ${WF09_NAME}`,
        );
      }

      const transcriptCustomerId = transcript.customerId;
      if (
        workflowRun.customerId &&
        transcriptCustomerId &&
        workflowRun.customerId !== transcriptCustomerId
      ) {
        throw new BadRequestException(
          'WorkflowRun customer does not match transcript customer',
        );
      }

      const transcriptLeadId = transcript.leadId;
      if (
        workflowRun.leadId &&
        transcriptLeadId &&
        workflowRun.leadId !== transcriptLeadId
      ) {
        throw new BadRequestException(
          'WorkflowRun lead does not match transcript lead',
        );
      }

      const isSuccess = dto.status === 'SUCCESS';
      const targetRunStatus = isSuccess
        ? WorkflowStatus.SUCCESS
        : WorkflowStatus.FAILED;

      // 3. State-machine & Active-state assertion:
      const isTerminal =
        workflowRun.status === WorkflowStatus.SUCCESS ||
        workflowRun.status === WorkflowStatus.FAILED;

      if (isTerminal) {
        if (workflowRun.status !== targetRunStatus) {
          throw new ConflictException(
            `Conflict: WorkflowRun '${workflowRun.id}' is already in terminal state '${workflowRun.status}', cannot transition to '${targetRunStatus}'`,
          );
        }

        if (isSuccess) {
          const existingSummary = await manager.findOne(ConversationSummary, {
            where: { transcriptId: transcript.id },
          });
          const existingText =
            existingSummary?.summary || existingSummary?.summaryText || '';
          const incomingText = (dto.summaryText || dto.summary || '').trim();

          if (existingText && existingText !== incomingText) {
            throw new ConflictException(
              `Conflict: WorkflowRun '${workflowRun.id}' was already completed with a conflicting summary`,
            );
          }

          const existingItems =
            (await manager.find(ConversationActionItem, {
              where: { summaryId: existingSummary?.id },
            })) ?? [];

          this.logger.warn(
            `Idempotent duplicate callback detected for transcript ${dto.transcriptId}, workflowRunId=${workflowRun.id}`,
          );
          return {
            success: true,
            transcriptId: transcript.id,
            workflowRunId: workflowRun.id,
            summaryId: existingSummary?.id,
            actionItemCount:
              existingSummary?.actionItems?.length ?? existingItems.length,
            status: 'SUCCESS',
            processingStatus: 'COMPLETED',
            isDuplicate: true,
          };
        } else {
          const existingError = workflowRun.errorMessage || '';
          const incomingError = (
            dto.errorMessage || 'AI generation failed'
          ).trim();

          if (existingError && existingError !== incomingError) {
            throw new ConflictException(
              `Conflict: WorkflowRun '${workflowRun.id}' was already marked FAILED with a different error message`,
            );
          }

          this.logger.warn(
            `Idempotent duplicate failed callback detected for transcript ${dto.transcriptId}, workflowRunId=${workflowRun.id}`,
          );
          return {
            success: false,
            transcriptId: transcript.id,
            workflowRunId: workflowRun.id,
            status: 'FAILED',
            errorMessage: existingError,
            processingStatus: 'FAILED',
            isDuplicate: true,
          };
        }
      }

      // Handle Failure
      if (!isSuccess) {
        const errorMsg = dto.errorMessage || 'AI generation failed';
        workflowRun.status = WorkflowStatus.FAILED;
        workflowRun.errorMessage = errorMsg;
        workflowRun.finishedAt = new Date();
        await manager.save(WorkflowRun, workflowRun);

        return {
          success: false,
          transcriptId: transcript.id,
          workflowRunId: workflowRun.id,
          status: 'FAILED',
          errorMessage: errorMsg,
          processingStatus: 'FAILED',
        };
      }

      // Handle Success
      const summaryContent = (dto.summaryText || dto.summary || '').trim();
      const decisionsList: Array<Record<string, unknown>> = [];
      if (dto.sentiment || dto.intent) {
        decisionsList.push({
          sentiment: dto.sentiment,
          intent: dto.intent,
        });
      }
      if (Array.isArray(dto.keyPoints)) {
        for (const kp of dto.keyPoints) {
          decisionsList.push({ keyPoint: kp });
        }
      }
      if (Array.isArray(dto.decisions)) {
        decisionsList.push(...dto.decisions);
      }

      let summary = await manager.findOne(ConversationSummary, {
        where: { transcriptId: transcript.id },
      });
      if (!summary) {
        summary = manager.create(ConversationSummary, {
          transcriptId: transcript.id,
          workflowRunId: workflowRun.id,
          meetingId: transcript.meetingId || null,
          summary: summaryContent,
          decisions: decisionsList,
          risks: Array.isArray(dto.risks) ? dto.risks : [],
        });
        summary = await manager.save(summary);
      }

      // Save Action Items with Deduplication
      const existingItems =
        (await manager.find(ConversationActionItem, {
          where: { summaryId: summary.id },
        })) ?? [];
      const existingTitles = new Set(
        existingItems.map((i) => i.title.toLowerCase().trim()),
      );
      const savedItems: ConversationActionItem[] = [];

      if (Array.isArray(dto.actionItems) && dto.actionItems.length > 0) {
        for (const item of dto.actionItems) {
          const normalizedTitle = item.title?.trim();
          if (
            !normalizedTitle ||
            existingTitles.has(normalizedTitle.toLowerCase())
          ) {
            continue;
          }
          existingTitles.add(normalizedTitle.toLowerCase());

          const itemHash = createHash('sha256')
            .update(normalizedTitle)
            .digest('hex')
            .slice(0, 32);

          const actionItem = manager.create(ConversationActionItem, {
            summaryId: summary.id,
            workflowRunId: workflowRun.id,
            title: normalizedTitle,
            ownerAttendeeId: item.assignedTo || item.ownerAttendeeId || null,
            dueDate: item.dueAt
              ? new Date(item.dueAt)
              : item.dueDate
                ? new Date(item.dueDate)
                : null,
            confidence: item.confidence ?? 0.85,
            requiresConfirmation: item.approvalState
              ? item.approvalState === 'PROPOSED'
              : true,
            status: item.status || 'PENDING_CONFIRMATION',
            idempotencyKey: `wf09:${workflowRun.id}:action:${itemHash}`,
          });
          savedItems.push(await manager.save(actionItem));
        }
      }

      workflowRun.status = WorkflowStatus.SUCCESS;
      workflowRun.outputPayload = {
        summary: summaryContent,
        decisions: decisionsList,
        risks: dto.risks || [],
        rawAIOutput: dto.rawAIOutput || null,
        actionItemCount: savedItems.length + existingItems.length,
      };
      workflowRun.finishedAt = new Date();
      await manager.save(workflowRun);

      if (workflowRun.triggeredByUserId) {
        const notif = manager.create(Notification, {
          userId: workflowRun.triggeredByUserId,
          type: NotificationType.CONVERSATION_SUMMARY_READY,
          title: 'Conversation Summary Ready',
          content: 'AI summary has been generated for your conversation.',
          leadId: workflowRun.leadId || null,
          customerId: workflowRun.customerId || null,
          idempotencyKey: `notif:wf09:${workflowRun.id}:completed`,
        });
        await manager.save(Notification, notif).catch((err) => {
          this.logger.warn(`Failed to create notification: ${err}`);
        });
      }

      return {
        success: true,
        transcriptId: transcript.id,
        workflowRunId: workflowRun.id,
        summaryId: summary.id,
        ownerId: workflowRun.triggeredByUserId,
        createdBy: workflowRun.triggeredByUserId,
        actionItemCount: savedItems.length + existingItems.length,
        status: 'SUCCESS',
        processingStatus: 'COMPLETED',
      };
    });
  }

  async updateInternalRedactedContent(
    transcriptId: string,
    dto: UpdateInternalRedactedContentDto,
  ) {
    const transcript = await this.transcriptsRepository.findOne({
      where: { id: transcriptId },
    });
    if (!transcript) {
      throw new NotFoundException(`Transcript ${transcriptId} not found`);
    }

    transcript.redactedText = dto.redactedContent;
    transcript.contentHash = createHash('sha256')
      .update(dto.redactedContent)
      .digest('hex');
    await this.transcriptsRepository.save(transcript);

    return {
      success: true,
      transcriptId: transcript.id,
      redactedContent: transcript.redactedText,
    };
  }

  async saveInternalActionItems(
    summaryId: string,
    dto: SaveInternalActionItemsDto,
  ) {
    const summary = await this.summariesRepository.findOne({
      where: { id: summaryId },
    });
    if (!summary) {
      throw new NotFoundException(`Summary ${summaryId} not found`);
    }

    const existingItems = await this.actionItemsRepository.find({
      where: { summaryId },
    });
    const existingTitles = new Set(
      existingItems.map((i) => i.title.toLowerCase().trim()),
    );

    const savedItems: ConversationActionItem[] = [];
    if (Array.isArray(dto.actionItems)) {
      for (const item of dto.actionItems) {
        const normalizedTitle = item.title?.trim();
        if (
          !normalizedTitle ||
          existingTitles.has(normalizedTitle.toLowerCase())
        ) {
          continue;
        }
        existingTitles.add(normalizedTitle.toLowerCase());

        const itemHash = createHash('sha256')
          .update(normalizedTitle)
          .digest('hex')
          .slice(0, 32);

        const actionItem = this.actionItemsRepository.create({
          summaryId: summary.id,
          workflowRunId: summary.workflowRunId,
          title: normalizedTitle,
          ownerAttendeeId: item.assignedTo || item.ownerAttendeeId || null,
          dueDate: item.dueAt
            ? new Date(item.dueAt)
            : item.dueDate
              ? new Date(item.dueDate)
              : null,
          confidence: item.confidence ?? 0.85,
          requiresConfirmation: item.approvalState
            ? item.approvalState === 'PROPOSED'
            : true,
          status: item.status || 'PENDING_CONFIRMATION',
          idempotencyKey: `wf09:${summary.workflowRunId}:action:${itemHash}`,
        });
        savedItems.push(await this.actionItemsRepository.save(actionItem));
      }
    }

    return {
      success: true,
      summaryId,
      count: savedItems.length,
      createdCount: savedItems.length,
      actionItems: savedItems,
    };
  }

  async getActionItems(summaryId: string, user: AuthenticatedUser) {
    const summary = await this.summariesRepository.findOne({
      where: { id: summaryId },
    });
    if (!summary) {
      throw new NotFoundException(`Summary ${summaryId} not found`);
    }

    const workflowRun = await this.workflowRunsRepository.findOne({
      where: { id: summary.workflowRunId },
    });

    await this.validateEntityAccess(
      user,
      workflowRun?.customerId,
      workflowRun?.leadId,
      workflowRun?.triggeredByUserId,
    );

    return this.actionItemsRepository.find({
      where: { summaryId },
      order: { createdAt: 'ASC' },
    });
  }

  async updateActionItem(
    itemId: string,
    dto: UpdateActionItemDto,
    user: AuthenticatedUser,
  ) {
    const item = await this.actionItemsRepository.findOne({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException(`ActionItem ${itemId} not found`);
    }

    let isOwner = false;
    let isLeadOwner = false;
    let isCustomerCreator = false;

    if (item.workflowRunId) {
      const workflowRun = await this.workflowRunsRepository.findOne({
        where: { id: item.workflowRunId },
      });
      if (workflowRun) {
        if (workflowRun.triggeredByUserId === user.id) isOwner = true;
        if (workflowRun.leadId) {
          const lead = await this.leadsRepository.findOne({
            where: { id: workflowRun.leadId },
          });
          if (lead?.ownerId === user.id) isLeadOwner = true;
        }
        if (workflowRun.customerId) {
          const customer = await this.customersRepository.findOne({
            where: { id: workflowRun.customerId },
          });
          if (customer?.createdBy === user.id) isCustomerCreator = true;
        }
      }
    }

    const summary = item.summary;
    if (summary?.transcript) {
      const transcript = summary.transcript;
      if (transcript.createdBy === user.id) isOwner = true;
      if (transcript.lead?.ownerId === user.id) isLeadOwner = true;
      if (transcript.customer?.createdBy === user.id) isCustomerCreator = true;
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const canManage = isAdmin || isOwner || isLeadOwner || isCustomerCreator;
    const isAssignee =
      (Boolean(item.ownerAttendeeId) && item.ownerAttendeeId === user.id) ||
      (Boolean(item.assignedTo) && item.assignedTo === user.id);

    if (!canManage && !isAssignee) {
      throw new ForbiddenException(
        'You do not have permission to modify this action item',
      );
    }

    // Only Admin or Workflow Owner can approve/reject
    if (dto.approvalState !== undefined) {
      if (!canManage) {
        throw new ForbiddenException(
          'Only the conversation owner or an Admin can approve/reject action items',
        );
      }
      item.approvalState = dto.approvalState;
    }

    // Only Admin or Workflow Owner can reassign
    const targetAssignee = dto.assignedTo || dto.ownerAttendeeId;
    if (targetAssignee !== undefined) {
      if (!canManage) {
        throw new ForbiddenException(
          'Only the conversation owner or an Admin can reassign action items',
        );
      }
      if (targetAssignee) {
        const assignee = await this.usersRepository.findOne({
          where: { id: targetAssignee },
        });
        if (!assignee) {
          throw new NotFoundException(
            `Assigned user ${targetAssignee} not found`,
          );
        }
        if (assignee.status !== UserStatus.ACTIVE) {
          throw new BadRequestException(
            `Assigned user ${targetAssignee} is not ACTIVE`,
          );
        }
      }
      item.ownerAttendeeId = targetAssignee || null;
      item.assignedTo = targetAssignee || null;
    }

    // Only Admin or Workflow Owner can modify details
    if (
      dto.title !== undefined ||
      dto.dueAt !== undefined ||
      dto.dueDate !== undefined
    ) {
      if (!canManage) {
        throw new ForbiddenException(
          'Only the conversation owner or an Admin can modify action item details',
        );
      }
      if (dto.title !== undefined) item.title = dto.title;
      if (dto.dueAt !== undefined) {
        item.dueDate = dto.dueAt ? new Date(dto.dueAt) : null;
      } else if (dto.dueDate !== undefined) {
        item.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      }
    }

    // Assignee, Owner or Admin can update execution status
    if (dto.status !== undefined) {
      if (!canManage && !isAssignee) {
        throw new ForbiddenException(
          'You are not permitted to update status for this action item',
        );
      }
      item.status = dto.status;
    }

    return this.actionItemsRepository.save(item);
  }
}
