import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { NotificationType } from '../notifications/enums/notification.enum.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import {
  ConversationCallbackDto,
  CreateTranscriptDto,
  SaveInternalActionItemsDto,
  UpdateActionItemDto,
  UpdateInternalRedactedContentDto,
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
   * Redacts sensitive personal information (PII) before external AI processing
   * per Topic 12 Architecture & Privacy Policy (docs/05_BUSINESS_RULES_AND_ARCHITECTURE.md).
   * Identifies and masks emails, credit cards, bank/account numbers, and phone numbers.
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
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (leadId) {
      const lead = await this.leadsRepository.findOne({
        where: { id: leadId },
      });
      if (!lead) {
        throw new NotFoundException(`Lead with ID ${leadId} not found`);
      }
      if (lead.ownerId && lead.ownerId !== user.id) {
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
      if (customer.createdBy && customer.createdBy !== user.id) {
        throw new ForbiddenException(
          `You do not have permission to access Customer ${customerId}`,
        );
      }
    }
  }

  /**
   * Enforces role and CRM ownership checks on an existing transcript.
   */
  private checkTranscriptAccess(
    transcript: ConversationTranscript,
    user: AuthenticatedUser,
  ): void {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    const isCreator = transcript.createdBy === user.id;
    const isLeadOwner = transcript.lead?.ownerId === user.id;
    const isCustomerCreator = transcript.customer?.createdBy === user.id;

    if (!isCreator && !isLeadOwner && !isCustomerCreator) {
      throw new ForbiddenException(
        'You do not have access to this conversation transcript',
      );
    }
  }

  /**
   * Ingests a new conversation transcript and triggers AI Summarizer workflow (T12-WF09).
   */
  async createTranscript(dto: CreateTranscriptDto, user: AuthenticatedUser) {
    await this.validateEntityAccess(user, dto.customerId, dto.leadId);

    const redactedContent = this.redactSensitiveContent(dto.content);

    const transcript = this.transcriptsRepository.create({
      customerId: dto.customerId ?? null,
      leadId: dto.leadId ?? null,
      meetingId: dto.meetingId ?? null,
      sourceType: dto.sourceType || 'CALL',
      redactedContent,
      processingStatus: TranscriptProcessingStatus.PENDING,
      createdBy: user.id,
    });

    const savedTranscript = await this.transcriptsRepository.save(transcript);

    // Create correlated WorkflowRun
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 't12-wf09-conversation-summarizer',
      leadId: dto.leadId ?? null,
      customerId: dto.customerId ?? null,
      triggeredByUserId: user.id,
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
      createdBy: transcript.createdBy,
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
      await this.transcriptsRepository.update(transcriptId, {
        processingStatus: TranscriptProcessingStatus.FAILED,
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
        await this.transcriptsRepository.update(transcriptId, {
          processingStatus: TranscriptProcessingStatus.FAILED,
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
      await this.transcriptsRepository.update(transcriptId, {
        processingStatus: TranscriptProcessingStatus.FAILED,
      });
    }
  }

  async getTranscript(id: string, user: AuthenticatedUser) {
    const transcript = await this.transcriptsRepository.findOne({
      where: { id },
      relations: { customer: true, lead: true },
    });
    if (!transcript) {
      throw new NotFoundException(`Conversation transcript ${id} not found`);
    }

    this.checkTranscriptAccess(transcript, user);

    return transcript;
  }

  async getTranscriptSummary(transcriptId: string, user: AuthenticatedUser) {
    const transcript = await this.getTranscript(transcriptId, user);
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

    const workflowRun = await this.workflowRunsRepository.findOne({
      where: { id: dto.workflowRunId },
    });
    if (!workflowRun) {
      throw new NotFoundException(`WorkflowRun ${dto.workflowRunId} not found`);
    }

    // Correlation check: transcript must match workflowRun
    if (
      transcript.workflowRunId &&
      transcript.workflowRunId !== workflowRun.id
    ) {
      throw new BadRequestException(
        'WorkflowRun ID does not match transcript correlation',
      );
    }

    // Correlation check: workflowName must be t12-wf09-conversation-summarizer
    if (workflowRun.workflowName !== 't12-wf09-conversation-summarizer') {
      throw new BadRequestException(
        `WorkflowRun ${workflowRun.id} belongs to ${workflowRun.workflowName}, expected t12-wf09-conversation-summarizer`,
      );
    }

    // Correlation check: customer alignment
    if (
      workflowRun.customerId &&
      transcript.customerId &&
      workflowRun.customerId !== transcript.customerId
    ) {
      throw new BadRequestException(
        'WorkflowRun customer does not match transcript customer',
      );
    }

    // Correlation check: lead alignment
    if (
      workflowRun.leadId &&
      transcript.leadId &&
      workflowRun.leadId !== transcript.leadId
    ) {
      throw new BadRequestException(
        'WorkflowRun lead does not match transcript lead',
      );
    }

    const isSuccess = dto.status === 'SUCCESS';

    // Idempotency: If already succeeded and summary exists, return existing summary
    if (isSuccess) {
      const existingSummary = await this.summariesRepository.findOne({
        where: { transcriptId: transcript.id },
        relations: { actionItems: true },
      });
      if (existingSummary) {
        this.logger.log(
          `Summary already exists for transcript ${transcript.id}; returning existing idempotent result`,
        );
        return {
          success: true,
          transcriptId: transcript.id,
          summaryId: existingSummary.id,
          ownerId: transcript.createdBy,
          createdBy: transcript.createdBy,
          actionItemCount: existingSummary.actionItems?.length || 0,
          processingStatus: transcript.processingStatus,
        };
      }
    }

    // Persist callback updates atomically in a single transaction
    return await this.dataSource.transaction(async (manager) => {
      transcript.processingStatus = isSuccess
        ? TranscriptProcessingStatus.COMPLETED
        : TranscriptProcessingStatus.FAILED;
      await manager.save(transcript);

      workflowRun.status = isSuccess
        ? WorkflowStatus.SUCCESS
        : WorkflowStatus.FAILED;
      workflowRun.finishedAt = new Date();
      workflowRun.errorMessage = isSuccess
        ? null
        : (dto.errorMessage ?? 'Workflow execution reported failure');
      workflowRun.outputPayload = isSuccess
        ? {
            summaryText: dto.summaryText,
            sentiment: dto.sentiment,
            intent: dto.intent,
            keyPoints: dto.keyPoints,
            actionItemsCount: dto.actionItems?.length || 0,
            rawAIOutput: dto.rawAIOutput,
          }
        : {
            errorMessage: dto.errorMessage,
            rawAIOutput: dto.rawAIOutput,
          };
      await manager.save(workflowRun);

      if (!isSuccess) {
        return {
          success: false,
          transcriptId: transcript.id,
          status: transcript.processingStatus,
          errorMessage: workflowRun.errorMessage,
        };
      }

      // Check concurrency in case another callback inserted summary
      let summary = await manager.findOne(ConversationSummary, {
        where: { transcriptId: transcript.id },
      });
      if (!summary) {
        summary = manager.create(ConversationSummary, {
          transcriptId: transcript.id,
          summaryText: dto.summaryText ?? '',
          sentiment: dto.sentiment ?? 'NEUTRAL',
          intent: dto.intent ?? 'Account check-in / Commercial update',
          keyPoints: dto.keyPoints || [],
          rawAIOutput: dto.rawAIOutput ?? null,
        });
        summary = await manager.save(summary);
      }

      // Persist ConversationActionItems if provided in callback (deduplicated by title)
      const existingItems = await manager.find(ConversationActionItem, {
        where: { summaryId: summary.id },
      });
      const existingTitles = new Set(
        existingItems.map((i) => (i.title || '').trim().toLowerCase()),
      );
      const savedItems: ConversationActionItem[] = [];

      if (Array.isArray(dto.actionItems) && dto.actionItems.length > 0) {
        for (const item of dto.actionItems) {
          const normalizedTitle = (item.title || '').trim().toLowerCase();
          if (!normalizedTitle || existingTitles.has(normalizedTitle)) {
            continue;
          }
          existingTitles.add(normalizedTitle);

          const actionItem = manager.create(ConversationActionItem, {
            summaryId: summary.id,
            title: item.title,
            assignedTo: item.assignedTo ?? transcript.createdBy ?? null,
            dueAt: item.dueAt ? new Date(item.dueAt) : null,
            status:
              (item.status as ActionItemStatus) || ActionItemStatus.PENDING,
            approvalState:
              (item.approvalState as ActionItemApprovalState) ||
              ActionItemApprovalState.PROPOSED,
          });
          savedItems.push(await manager.save(actionItem));
        }
      }

      // Create an in-app notification for the transcript creator
      if (transcript.createdBy) {
        try {
          const notification = manager.create(Notification, {
            userId: transcript.createdBy,
            type: NotificationType.CONVERSATION_SUMMARY_READY,
            title: 'Conversation Summary Ready',
            content: `AI has generated summary and ${savedItems.length} proposed action item(s) for your ${transcript.sourceType.toLowerCase()}.`,
            customerId: transcript.customerId,
            leadId: transcript.leadId,
          });
          await manager.save(notification);
        } catch (err: unknown) {
          this.logger.warn(
            `Could not save notification: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return {
        success: true,
        transcriptId: transcript.id,
        summaryId: summary.id,
        ownerId: transcript.createdBy,
        createdBy: transcript.createdBy,
        actionItemCount: savedItems.length + existingItems.length,
        processingStatus: transcript.processingStatus,
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

    transcript.redactedContent = dto.redactedContent;
    await this.transcriptsRepository.save(transcript);

    return {
      success: true,
      transcriptId: transcript.id,
      redactedLength: transcript.redactedContent.length,
    };
  }

  async saveInternalActionItems(
    summaryId: string,
    dto: SaveInternalActionItemsDto,
  ) {
    const summary = await this.summariesRepository.findOne({
      where: { id: summaryId },
      relations: { transcript: true },
    });
    if (!summary) {
      throw new NotFoundException(`Summary ${summaryId} not found`);
    }

    const existingItems = await this.actionItemsRepository.find({
      where: { summaryId: summary.id },
    });
    const existingTitles = new Set(
      existingItems.map((i) => (i.title || '').trim().toLowerCase()),
    );

    const savedItems: ConversationActionItem[] = [];
    if (Array.isArray(dto.actionItems)) {
      for (const item of dto.actionItems) {
        const normalizedTitle = (item.title || '').trim().toLowerCase();
        if (!normalizedTitle || existingTitles.has(normalizedTitle)) {
          continue;
        }
        existingTitles.add(normalizedTitle);

        const actionItem = this.actionItemsRepository.create({
          summaryId: summary.id,
          title: item.title,
          assignedTo: item.assignedTo ?? summary.transcript?.createdBy ?? null,
          dueAt: item.dueAt ? new Date(item.dueAt) : null,
          status: (item.status as ActionItemStatus) || ActionItemStatus.PENDING,
          approvalState:
            (item.approvalState as ActionItemApprovalState) ||
            ActionItemApprovalState.PROPOSED,
        });
        savedItems.push(await this.actionItemsRepository.save(actionItem));
      }
    }

    return {
      success: true,
      summaryId,
      count: savedItems.length,
    };
  }

  async getActionItems(summaryId: string, user: AuthenticatedUser) {
    const summary = await this.summariesRepository.findOne({
      where: { id: summaryId },
      relations: {
        transcript: { customer: true, lead: true },
      },
    });
    if (!summary) {
      throw new NotFoundException(`Summary ${summaryId} not found`);
    }

    if (summary.transcript) {
      this.checkTranscriptAccess(summary.transcript, user);
    }

    return this.actionItemsRepository.find({
      where: { summaryId },
      order: { createdAt: 'ASC' },
      relations: { assignedUser: true },
    });
  }

  async updateActionItem(
    id: string,
    dto: UpdateActionItemDto,
    user: AuthenticatedUser,
  ) {
    const item = await this.actionItemsRepository.findOne({
      where: { id },
      relations: {
        summary: {
          transcript: { customer: true, lead: true },
        },
        assignedUser: true,
      },
    });
    if (!item) {
      throw new NotFoundException(`Action item ${id} not found`);
    }

    const transcript = item.summary?.transcript;
    const isAdmin = user.role === UserRole.ADMIN;
    const isOwner = Boolean(
      transcript &&
      (transcript.createdBy === user.id ||
        transcript.lead?.ownerId === user.id ||
        transcript.customer?.createdBy === user.id),
    );
    const isAssignee = item.assignedTo === user.id;

    if (!isAdmin && !isOwner && !isAssignee) {
      throw new ForbiddenException(
        'You do not have permission to modify this action item',
      );
    }

    // Role check: Only Admin or record owners can approve or reject action items
    if (dto.approvalState !== undefined) {
      if (!isAdmin && !isOwner) {
        throw new ForbiddenException(
          'Only managers or record owners can approve or reject action items',
        );
      }
      item.approvalState = dto.approvalState;
    }

    // Role check: Only Admin or record owners can reassign action items
    if (dto.assignedTo !== undefined) {
      if (!isAdmin && !isOwner) {
        throw new ForbiddenException(
          'Only managers or record owners can reassign action items',
        );
      }
      if (dto.assignedTo) {
        const assignee = await this.usersRepository.findOne({
          where: { id: dto.assignedTo },
        });
        if (!assignee) {
          throw new NotFoundException(
            `User with ID ${dto.assignedTo} not found`,
          );
        }
        if (assignee.status !== UserStatus.ACTIVE) {
          throw new BadRequestException('Assignee must be an ACTIVE user');
        }
      }
      item.assignedTo = dto.assignedTo;
    }

    // Role check: Only Admin or record owners can modify action item details (title, dueAt)
    if (dto.title !== undefined || dto.dueAt !== undefined) {
      if (!isAdmin && !isOwner) {
        throw new ForbiddenException(
          'Only managers or record owners can modify action item details',
        );
      }
      if (dto.title !== undefined) item.title = dto.title;
      if (dto.dueAt !== undefined) {
        item.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      }
    }

    // Status: Assignee, owner, or admin can update status
    if (dto.status !== undefined) {
      if (!isAdmin && !isOwner && !isAssignee) {
        throw new ForbiddenException(
          'You are not authorized to update the status of this action item',
        );
      }
      item.status = dto.status;
    }

    return this.actionItemsRepository.save(item);
  }
}
