import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConversationTranscript,
  TranscriptProcessingStatus,
} from './entities/conversation-transcript.entity.js';
import { ConversationSummary } from './entities/conversation-summary.entity.js';
import {
  ActionItemApprovalState,
  ActionItemStatus,
  ConversationActionItem,
} from './entities/conversation-action-item.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import {
  ConversationCallbackDto,
  CreateTranscriptDto,
  UpdateActionItemDto,
} from './dto/index.js';

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

    private readonly configService: ConfigService,
  ) {}

  /**
   * Redacts sensitive personal information (PII) before external AI processing
   * per Topic 12 Architecture & Privacy Policy (docs/05_BUSINESS_RULES_AND_ARCHITECTURE.md)
   */
  public redactSensitiveContent(rawText: string): string {
    if (!rawText) return '';
    return (
      rawText
        // Email addresses
        .replace(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
          '[REDACTED_EMAIL]',
        )
        // Phone numbers (e.g. +84 912345678, (028) 38234567, 090-123-4567)
        .replace(
          /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
          '[REDACTED_PHONE]',
        )
        // 16-digit credit card sequences
        .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[REDACTED_CARD]')
    );
  }

  /**
   * Ingests a new conversation transcript and triggers AI Summarizer workflow (T12-WF09).
   */
  async createTranscript(dto: CreateTranscriptDto, userId?: string) {
    const redactedContent = this.redactSensitiveContent(dto.content);

    const transcript = this.transcriptsRepository.create({
      customerId: dto.customerId ?? null,
      leadId: dto.leadId ?? null,
      meetingId: dto.meetingId ?? null,
      sourceType: dto.sourceType || 'CALL',
      redactedContent,
      processingStatus: TranscriptProcessingStatus.PENDING,
      createdBy: userId ?? null,
    });

    const savedTranscript = await this.transcriptsRepository.save(transcript);

    // Create correlated WorkflowRun
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 't12-wf09-conversation-summarizer',
      leadId: dto.leadId ?? null,
      customerId: dto.customerId ?? null,
      triggeredByUserId: userId ?? null,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        transcriptId: savedTranscript.id,
        sourceType: savedTranscript.sourceType,
        customerId: savedTranscript.customerId,
        leadId: savedTranscript.leadId,
        contentLength: redactedContent.length,
      },
    });

    const savedRun = await this.workflowRunsRepository.save(workflowRun);

    savedTranscript.workflowRunId = savedRun.id;
    await this.transcriptsRepository.save(savedTranscript);

    // Asynchronously dispatch internal trigger to n8n
    this.dispatchToN8n(
      savedTranscript.id,
      savedRun.id,
      redactedContent,
      savedTranscript,
    ).catch((err: unknown) => {
      this.logger.warn(
        `Failed to dispatch T12-WF09 to n8n: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      message: 'Transcript ingested and AI summarization initiated',
      transcriptId: savedTranscript.id,
      workflowRunId: savedRun.id,
      processingStatus: savedTranscript.processingStatus,
      redactedContent: savedTranscript.redactedContent,
      createdAt: savedTranscript.createdAt,
    };
  }

  private async dispatchToN8n(
    transcriptId: string,
    workflowRunId: string,
    redactedContent: string,
    transcript: ConversationTranscript,
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
      customerId: transcript.customerId,
      leadId: transcript.leadId,
      sourceType: transcript.sourceType,
      redactedContent,
      timestamp: new Date().toISOString(),
    };

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY':
            this.configService.get<string>('N8N_API_KEY') ||
            'crm-automation-n8n-secret-key',
        },
        body: JSON.stringify(payload),
      });
      this.logger.log(
        `T12-WF09 successfully dispatched to n8n webhook: ${url}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Error dispatching T12-WF09: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getTranscript(id: string) {
    const transcript = await this.transcriptsRepository.findOne({
      where: { id },
      relations: { customer: true, lead: true },
    });
    if (!transcript) {
      throw new NotFoundException(`Conversation transcript ${id} not found`);
    }
    return transcript;
  }

  async getTranscriptSummary(transcriptId: string) {
    const transcript = await this.getTranscript(transcriptId);
    const summary = await this.summariesRepository.findOne({
      where: { transcriptId },
      relations: { actionItems: true },
      order: { createdAt: 'DESC' },
    });

    return {
      transcriptId: transcript.id,
      processingStatus: transcript.processingStatus,
      redactedContent: transcript.redactedContent,
      sourceType: transcript.sourceType,
      summary: summary
        ? {
            id: summary.id,
            summaryText: summary.summaryText,
            sentiment: summary.sentiment,
            intent: summary.intent,
            keyPoints: summary.keyPoints || [],
            actionItems: summary.actionItems || [],
            createdAt: summary.createdAt,
          }
        : null,
    };
  }

  async handleCallback(dto: ConversationCallbackDto) {
    this.logger.log(
      `Received T12-WF09 callback for transcript ${dto.transcriptId}, status=${dto.status}`,
    );

    const transcript = await this.transcriptsRepository.findOne({
      where: { id: dto.transcriptId },
    });
    if (!transcript) {
      throw new NotFoundException(`Transcript ${dto.transcriptId} not found`);
    }

    const isSuccess = dto.status === 'SUCCESS';
    transcript.processingStatus = isSuccess
      ? TranscriptProcessingStatus.COMPLETED
      : TranscriptProcessingStatus.FAILED;
    await this.transcriptsRepository.save(transcript);

    // Update WorkflowRun
    const workflowRun = await this.workflowRunsRepository.findOne({
      where: { id: dto.workflowRunId },
    });
    if (workflowRun) {
      workflowRun.status = isSuccess
        ? WorkflowStatus.SUCCESS
        : WorkflowStatus.FAILED;
      workflowRun.finishedAt = new Date();
      workflowRun.errorMessage = dto.errorMessage ?? null;
      workflowRun.outputPayload = {
        summaryText: dto.summaryText,
        sentiment: dto.sentiment,
        intent: dto.intent,
        keyPoints: dto.keyPoints,
        actionItemsCount: dto.actionItems?.length || 0,
        rawAIOutput: dto.rawAIOutput,
      };
      await this.workflowRunsRepository.save(workflowRun);
    }

    if (!isSuccess) {
      return {
        success: false,
        transcriptId: transcript.id,
        status: transcript.processingStatus,
      };
    }

    // Persist ConversationSummary
    const summary = this.summariesRepository.create({
      transcriptId: transcript.id,
      summaryText: dto.summaryText,
      sentiment: dto.sentiment ?? 'NEUTRAL',
      intent: dto.intent ?? 'Account check-in / Commercial update',
      keyPoints: dto.keyPoints || [],
      rawAIOutput: dto.rawAIOutput ?? null,
    });
    const savedSummary = await this.summariesRepository.save(summary);

    // Persist ConversationActionItems
    const savedItems: ConversationActionItem[] = [];
    if (Array.isArray(dto.actionItems) && dto.actionItems.length > 0) {
      for (const item of dto.actionItems) {
        const actionItem = this.actionItemsRepository.create({
          summaryId: savedSummary.id,
          title: item.title,
          assignedTo: item.assignedTo ?? transcript.createdBy ?? null,
          dueAt: item.dueAt ? new Date(item.dueAt) : null,
          status: ActionItemStatus.PENDING,
          approvalState: ActionItemApprovalState.PROPOSED,
        });
        savedItems.push(await this.actionItemsRepository.save(actionItem));
      }
    }

    // Create an in-app notification if an owner or creator exists
    if (transcript.createdBy) {
      try {
        const notification = this.notificationsRepository.create({
          userId: transcript.createdBy,
          type: 'CONVERSATION_SUMMARY_READY',
          title: 'Conversation Summary Ready',
          content: `AI has generated summary and ${savedItems.length} proposed action item(s) for your ${transcript.sourceType.toLowerCase()}.`,
          customerId: transcript.customerId,
          leadId: transcript.leadId,
        });
        await this.notificationsRepository.save(notification);
      } catch (err: unknown) {
        this.logger.warn(
          `Could not save notification: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      success: true,
      transcriptId: transcript.id,
      summaryId: savedSummary.id,
      actionItemCount: savedItems.length,
      processingStatus: transcript.processingStatus,
    };
  }

  async getActionItems(summaryId: string) {
    return this.actionItemsRepository.find({
      where: { summaryId },
      order: { createdAt: 'ASC' },
      relations: { assignedUser: true },
    });
  }

  async updateActionItem(id: string, dto: UpdateActionItemDto) {
    const item = await this.actionItemsRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Action item ${id} not found`);
    }

    if (dto.title !== undefined) item.title = dto.title;
    if (dto.assignedTo !== undefined) item.assignedTo = dto.assignedTo;
    if (dto.dueAt !== undefined)
      item.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.approvalState !== undefined) item.approvalState = dto.approvalState;

    return this.actionItemsRepository.save(item);
  }
}
