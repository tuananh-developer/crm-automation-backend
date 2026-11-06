import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CustomerFeedback,
  FeedbackStatus,
} from './entities/customer-feedback.entity.js';
import {
  CustomerTask,
  CustomerTaskPriority,
  CustomerTaskStatus,
} from './entities/customer-task.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import {
  CreateCustomerTaskDto,
  CreateFeedbackDto,
  FeedbackCallbackDto,
} from './dto/index.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(CustomerFeedback)
    private readonly feedbackRepository: Repository<CustomerFeedback>,

    @InjectRepository(CustomerTask)
    private readonly customerTasksRepository: Repository<CustomerTask>,

    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,

    @InjectRepository(WorkflowRun)
    private readonly workflowRunsRepository: Repository<WorkflowRun>,

    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,

    private readonly configService: ConfigService,

    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

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

  async validateCustomerAccess(
    user: AuthenticatedUser,
    customerId: string,
  ): Promise<Customer> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    if (
      user.role !== UserRole.ADMIN &&
      (!customer.createdBy || customer.createdBy !== user.id)
    ) {
      throw new ForbiddenException(
        `You do not have permission to access Customer ${customerId}`,
      );
    }
    return customer;
  }

  async createFeedback(dto: CreateFeedbackDto, user: AuthenticatedUser) {
    const customer = await this.validateCustomerAccess(user, dto.customerId);

    const safeContent = this.redactSensitiveContent(dto.content);

    const feedback = this.feedbackRepository.create({
      customerId: dto.customerId,
      source: dto.source || 'WEB',
      content: safeContent,
      contentRedacted: safeContent,
      rating: dto.rating ?? null,
      status: FeedbackStatus.NEW,
      receivedAt: new Date(),
    });

    const savedFeedback = await this.feedbackRepository.save(feedback);

    // Create correlated WorkflowRun
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 't12-wf14-customer-feedback',
      customerId: customer.id,
      triggeredByUserId: user.id,
      status: WorkflowStatus.PENDING,
      startedAt: new Date(),
      inputPayload: {
        feedbackId: savedFeedback.id,
        customerId: customer.id,
        rating: savedFeedback.rating,
        source: savedFeedback.source,
      },
    });

    const savedRun = await this.workflowRunsRepository.save(workflowRun);

    savedFeedback.workflowRunId = savedRun.id;
    await this.feedbackRepository.save(savedFeedback);

    // Asynchronously dispatch internal trigger to n8n
    this.dispatchToN8n(
      savedFeedback.id,
      savedRun.id,
      safeContent,
      customer,
    ).catch((err: unknown) => {
      this.logger.warn(
        `Failed to dispatch T12-WF14 to n8n: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      message: 'Customer feedback received and queued for AI classification',
      feedbackId: savedFeedback.id,
      workflowRunId: savedRun.id,
      status: savedFeedback.status,
      receivedAt: savedFeedback.receivedAt,
    };
  }

  private async dispatchToN8n(
    feedbackId: string,
    workflowRunId: string,
    safeContent: string,
    customer: Customer,
  ): Promise<void> {
    const n8nBaseUrl =
      this.configService.get<string>('N8N_INTERNAL_URL') ||
      this.configService.get<string>('N8N_WEBHOOK_URL') ||
      'http://localhost:5678';
    const webhookPath = '/webhook/t12-wf14-customer-feedback';
    const url = `${n8nBaseUrl.replace(/\/+$/, '')}${webhookPath}`;

    const payload = {
      feedbackId,
      workflowRunId,
      customerId: customer.id,
      customerName: customer.name,
      companyName: customer.companyName,
      createdBy: customer.createdBy,
      safeContent,
      timestamp: new Date().toISOString(),
    };

    const apiKey =
      this.configService.get<string>('N8N_API_KEY') ||
      this.configService.get<string>('N8N_WEBHOOK_SECRET');

    if (!apiKey) {
      const errorMsg =
        'N8N_API_KEY is not configured; cannot securely dispatch to n8n (Fail-Closed)';
      this.logger.error(errorMsg);
      await this.handleDispatchFailure(feedbackId, workflowRunId, errorMsg);
      throw new InternalServerErrorException(errorMsg);
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
        const errText = await response.text().catch(() => '');
        const errorMsg = `n8n webhook returned HTTP ${response.status}: ${errText.slice(0, 300)}`;
        this.logger.error(`Failed to dispatch T12-WF14 to n8n: ${errorMsg}`);
        await this.handleDispatchFailure(feedbackId, workflowRunId, errorMsg);
        return;
      }

      this.logger.log(
        `T12-WF14 successfully dispatched to n8n webhook: ${url}`,
      );
    } catch (err: unknown) {
      const errorMsg = `Network error dispatching T12-WF14: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error(errorMsg);
      await this.handleDispatchFailure(feedbackId, workflowRunId, errorMsg);
    }
  }

  private async handleDispatchFailure(
    feedbackId: string,
    workflowRunId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      const feedback = await this.feedbackRepository.findOne({
        where: { id: feedbackId },
      });
      if (feedback) {
        feedback.status = FeedbackStatus.FAILED;
        feedback.errorMessage = errorMessage;
        await this.feedbackRepository.save(feedback);
      }

      const workflowRun = await this.workflowRunsRepository.findOne({
        where: { id: workflowRunId },
      });
      if (workflowRun) {
        workflowRun.status = WorkflowStatus.FAILED;
        workflowRun.finishedAt = new Date();
        workflowRun.errorMessage = errorMessage;
        await this.workflowRunsRepository.save(workflowRun);
      }
    } catch (persistErr: unknown) {
      this.logger.error(
        `Failed to record dispatch failure for feedback ${feedbackId}: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
      );
    }
  }

  async getFeedback(id: string, user: AuthenticatedUser) {
    const feedback = await this.feedbackRepository.findOne({
      where: { id },
      relations: { customer: true },
    });
    if (!feedback) {
      throw new NotFoundException(`Customer feedback ${id} not found`);
    }
    await this.validateCustomerAccess(user, feedback.customerId);
    return feedback;
  }

  async getInternalFeedback(id: string) {
    const feedback = await this.feedbackRepository.findOne({
      where: { id },
      relations: { customer: true },
    });
    if (!feedback) {
      throw new NotFoundException(`Customer feedback ${id} not found`);
    }
    return feedback;
  }

  async getCustomerFeedback(customerId: string, user: AuthenticatedUser) {
    await this.validateCustomerAccess(user, customerId);
    return this.feedbackRepository.find({
      where: { customerId },
      order: { receivedAt: 'DESC' },
    });
  }

  async handleCallback(dto: FeedbackCallbackDto) {
    this.logger.log(
      `Received T12-WF14 callback for feedback ${dto.feedbackId}, status=${dto.status}`,
    );

    const processCallback = async (repos: {
      feedbackRepo: Repository<CustomerFeedback>;
      workflowRunsRepo: Repository<WorkflowRun>;
    }) => {
      // 1. Lock rows with pessimistic_write to prevent concurrent/race condition updates
      const feedback = await repos.feedbackRepo.findOne({
        where: { id: dto.feedbackId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!feedback) {
        throw new NotFoundException(`Feedback ${dto.feedbackId} not found`);
      }

      const workflowRun = await repos.workflowRunsRepo.findOne({
        where: { id: dto.workflowRunId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!workflowRun) {
        throw new BadRequestException(
          `Invalid callback correlation: WorkflowRun ${dto.workflowRunId} not found`,
        );
      }

      // 2. Correlation validations
      if (workflowRun.workflowName !== 't12-wf14-customer-feedback') {
        throw new BadRequestException(
          `Invalid callback correlation: WorkflowRun ${dto.workflowRunId} is not for t12-wf14-customer-feedback`,
        );
      }

      if (workflowRun.customerId !== feedback.customerId) {
        throw new BadRequestException(
          `Invalid callback correlation: WorkflowRun customer ${workflowRun.customerId} does not match feedback customer ${feedback.customerId}`,
        );
      }

      if (feedback.workflowRunId && feedback.workflowRunId !== workflowRun.id) {
        throw new BadRequestException(
          `Invalid callback correlation: WorkflowRun ${workflowRun.id} does not match feedback workflowRunId ${feedback.workflowRunId}`,
        );
      }

      if (
        workflowRun.inputPayload?.feedbackId &&
        workflowRun.inputPayload.feedbackId !== feedback.id
      ) {
        throw new BadRequestException(
          `Invalid callback correlation: WorkflowRun input feedbackId does not match callback feedbackId`,
        );
      }

      const isSuccess = dto.status === 'SUCCESS';
      const targetRunStatus = isSuccess
        ? WorkflowStatus.SUCCESS
        : WorkflowStatus.FAILED;
      const targetFeedbackStatus = isSuccess
        ? dto.escalationRequired
          ? FeedbackStatus.ESCALATED
          : FeedbackStatus.PROCESSED
        : FeedbackStatus.FAILED;

      // 3. State-machine & Active-state assertion
      const isRunTerminal =
        workflowRun.status === WorkflowStatus.SUCCESS ||
        workflowRun.status === WorkflowStatus.FAILED;

      const isFeedbackTerminal = feedback.status !== FeedbackStatus.NEW;

      if (isRunTerminal || isFeedbackTerminal) {
        // Conflicting terminal status (e.g. late FAILED callback attempting to overwrite SUCCESS, or SUCCESS trying to overwrite FAILED)
        if (
          workflowRun.status !== targetRunStatus ||
          (isSuccess && feedback.status === FeedbackStatus.FAILED) ||
          (!isSuccess && feedback.status !== FeedbackStatus.FAILED)
        ) {
          throw new ConflictException(
            `Conflict: WorkflowRun '${workflowRun.id}' is already in terminal state '${workflowRun.status}' (feedback status: '${feedback.status}'), cannot transition to '${targetRunStatus}'`,
          );
        }

        // Check if duplicate callback has conflicting payload
        if (isSuccess) {
          const payloadConflict =
            (dto.sentiment &&
              feedback.sentiment &&
              dto.sentiment !== feedback.sentiment) ||
            (dto.category &&
              feedback.category &&
              dto.category !== feedback.category) ||
            (dto.urgency &&
              feedback.urgency &&
              dto.urgency !== feedback.urgency) ||
            (dto.escalationRequired !== undefined &&
              Boolean(dto.escalationRequired) !==
                (feedback.status === FeedbackStatus.ESCALATED));

          if (payloadConflict) {
            throw new ConflictException(
              `Conflict: WorkflowRun '${workflowRun.id}' already completed with a conflicting feedback payload`,
            );
          }

          this.logger.warn(
            `Idempotent duplicate Customer Feedback callback detected for feedbackId=${feedback.id}, workflowRunId=${workflowRun.id}`,
          );
          return {
            success: true,
            feedbackId: feedback.id,
            status: feedback.status,
            escalationRequired: feedback.status === FeedbackStatus.ESCALATED,
          };
        } else {
          if (
            dto.errorMessage &&
            workflowRun.errorMessage &&
            dto.errorMessage.trim() !== workflowRun.errorMessage.trim()
          ) {
            throw new ConflictException(
              `Conflict: WorkflowRun '${workflowRun.id}' already failed with a conflicting error message`,
            );
          }

          this.logger.warn(
            `Idempotent duplicate failed Customer Feedback callback detected for feedbackId=${feedback.id}, workflowRunId=${workflowRun.id}`,
          );
          return {
            success: false,
            feedbackId: feedback.id,
            status: feedback.status,
            escalationRequired: false,
          };
        }
      }

      // 4. First transition from active state
      if (isSuccess) {
        feedback.sentiment = dto.sentiment ?? 'NEUTRAL';
        feedback.category = dto.category ?? 'General Feedback';
        feedback.urgency = dto.urgency ?? 'LOW';
        feedback.status = targetFeedbackStatus;
        feedback.rawAIOutput = dto.rawAIOutput ?? null;
        feedback.errorMessage = null;
        feedback.resolvedAt = !dto.escalationRequired ? new Date() : null;
      } else {
        feedback.status = FeedbackStatus.FAILED;
        feedback.errorMessage =
          dto.errorMessage ?? 'Workflow execution reported failure';
        if (dto.rawAIOutput) {
          feedback.rawAIOutput = dto.rawAIOutput;
        }
      }
      await repos.feedbackRepo.save(feedback);

      workflowRun.status = targetRunStatus;
      workflowRun.finishedAt = new Date();
      workflowRun.errorMessage = isSuccess
        ? null
        : (dto.errorMessage ?? 'Workflow execution reported failure');
      const fallbackMode =
        typeof dto.rawAIOutput?.classificationMode === 'string'
          ? dto.rawAIOutput.classificationMode
          : isSuccess
            ? 'GEMINI_AI'
            : 'HEURISTIC_FALLBACK';
      const fallbackProvider =
        typeof dto.rawAIOutput?.provider === 'string'
          ? dto.rawAIOutput.provider
          : isSuccess
            ? 'GEMINI'
            : 'FALLBACK_HEURISTIC';

      workflowRun.outputPayload = {
        sentiment: dto.sentiment,
        category: dto.category,
        urgency: dto.urgency,
        escalationRequired: dto.escalationRequired,
        classificationMode: dto.classificationMode ?? fallbackMode,
        provider: dto.provider ?? fallbackProvider,
        rawAIOutput: dto.rawAIOutput,
        errorMessage: isSuccess ? null : dto.errorMessage,
      };
      await repos.workflowRunsRepo.save(workflowRun);

      return {
        success: isSuccess,
        feedbackId: feedback.id,
        status: feedback.status,
        escalationRequired: Boolean(dto.escalationRequired),
      };
    };

    if (this.dataSource) {
      return await this.dataSource.transaction(async (manager) => {
        return processCallback({
          feedbackRepo: manager.getRepository(CustomerFeedback),
          workflowRunsRepo: manager.getRepository(WorkflowRun),
        });
      });
    }

    return await processCallback({
      feedbackRepo: this.feedbackRepository,
      workflowRunsRepo: this.workflowRunsRepository,
    });
  }

  /**
   * Concurrency-safe payload-aware idempotent creation of operational CustomerTask.
   * Validates CustomerFeedback relation and customer ownership.
   * Catches unique constraint collisions on idempotencyKey and returns existing record
   * only if payload matches; otherwise returns ConflictException.
   */
  async ensureCustomerTask(dto: CreateCustomerTaskDto) {
    // 1. Validate Customer ownership & existence
    const customer = await this.customersRepository.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${dto.customerId} not found`);
    }

    // 2. Link and validate CustomerFeedback relation
    const feedbackId =
      dto.customerFeedbackId ??
      (dto.sourceEntityType === 'CUSTOMER_FEEDBACK'
        ? dto.sourceEntityId
        : null);

    let feedback: CustomerFeedback | null = null;
    if (feedbackId) {
      feedback = await this.feedbackRepository.findOne({
        where: { id: feedbackId },
      });
      if (!feedback) {
        throw new NotFoundException(
          `Referenced CustomerFeedback ${feedbackId} not found`,
        );
      }
      if (feedback.customerId !== dto.customerId) {
        throw new BadRequestException(
          `CustomerFeedback ${feedbackId} belongs to customer ${feedback.customerId}, not ${dto.customerId}`,
        );
      }
    }

    const resolvedFeedbackId = feedback ? feedback.id : null;

    const normalizeTimestamp = (
      val?: Date | string | null,
    ): number | string | null => {
      if (val === undefined || val === null || val === '') return null;
      const date = val instanceof Date ? val : new Date(val);
      const time = date.getTime();
      return Number.isNaN(time) ? String(val) : time;
    };

    const requestedAssignee =
      dto.assignedTo ??
      (dto as { assigneeId?: string | null; assignee?: string | null })
        .assigneeId ??
      (dto as { assignee?: string | null }).assignee ??
      null;

    const requestedDueRaw =
      dto.dueAt ?? (dto as { dueDate?: Date | string | null }).dueDate ?? null;

    const requestedSourceType =
      dto.sourceEntityType ?? (resolvedFeedbackId ? 'CUSTOMER_FEEDBACK' : null);

    const requestedSourceId = dto.sourceEntityId ?? resolvedFeedbackId ?? null;

    // Helper to verify complete payload equivalence for idempotency
    const verifyPayloadMatch = (existingTask: CustomerTask) => {
      const existingFeedbackId = existingTask.customerFeedbackId ?? null;
      const existingAssignee =
        existingTask.assignedTo ??
        (
          existingTask as {
            assigneeId?: string | null;
            assignee?: string | null;
          }
        ).assigneeId ??
        (existingTask as { assignee?: string | null }).assignee ??
        null;
      const existingDueRaw =
        existingTask.dueAt ??
        (existingTask as { dueDate?: Date | string | null }).dueDate ??
        null;
      const existingSourceType =
        existingTask.sourceEntityType ??
        (existingFeedbackId ? 'CUSTOMER_FEEDBACK' : null);
      const existingSourceId =
        existingTask.sourceEntityId ?? existingFeedbackId ?? null;

      const customerMatches = existingTask.customerId === dto.customerId;
      const taskTypeMatches = existingTask.taskType === dto.taskType;
      const titleMatches = existingTask.title === dto.title;
      const descriptionMatches =
        (existingTask.description ?? null) === (dto.description ?? null);
      const priorityMatches =
        String(existingTask.priority ?? CustomerTaskPriority.MEDIUM) ===
        String(dto.priority ?? CustomerTaskPriority.MEDIUM);
      const statusMatches =
        String(existingTask.status ?? CustomerTaskStatus.OPEN) ===
        String(dto.status ?? CustomerTaskStatus.OPEN);
      const assigneeMatches = existingAssignee === requestedAssignee;
      const dueAtMatches =
        normalizeTimestamp(existingDueRaw) ===
        normalizeTimestamp(requestedDueRaw);
      const feedbackMatches = existingFeedbackId === resolvedFeedbackId;
      const sourceEntityTypeMatches =
        existingSourceType === requestedSourceType;
      const sourceEntityMatches = existingSourceId === requestedSourceId;
      const workflowRunMatches =
        (existingTask.workflowRunId ?? null) === (dto.workflowRunId ?? null);

      if (
        !customerMatches ||
        !taskTypeMatches ||
        !titleMatches ||
        !descriptionMatches ||
        !priorityMatches ||
        !statusMatches ||
        !assigneeMatches ||
        !dueAtMatches ||
        !feedbackMatches ||
        !sourceEntityTypeMatches ||
        !sourceEntityMatches ||
        !workflowRunMatches
      ) {
        throw new ConflictException(
          `Idempotency key '${dto.idempotencyKey}' was already used with different request parameters`,
        );
      }
    };

    // 3. Pre-check existing idempotency key
    const existing = await this.customerTasksRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      verifyPayloadMatch(existing);
      this.logger.log(
        `CustomerTask with idempotencyKey '${dto.idempotencyKey}' already exists with matching payload: returning existing task ${existing.id}`,
      );
      return { task: existing, created: false };
    }

    try {
      const task = this.customerTasksRepository.create({
        customerId: dto.customerId,
        customerFeedbackId: resolvedFeedbackId,
        workflowRunId: dto.workflowRunId ?? null,
        taskType: dto.taskType,
        title: dto.title,
        description: dto.description ?? null,
        priority: dto.priority ?? CustomerTaskPriority.MEDIUM,
        status: dto.status ?? CustomerTaskStatus.OPEN,
        assignedTo: requestedAssignee,
        dueAt: requestedDueRaw ? new Date(requestedDueRaw) : null,
        idempotencyKey: dto.idempotencyKey,
        sourceEntityType: requestedSourceType,
        sourceEntityId: requestedSourceId,
      });

      const saved = await this.customerTasksRepository.save(task);
      this.logger.log(
        `Created new CustomerTask ${saved.id} for customer ${dto.customerId}`,
      );
      return { task: saved, created: true };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (
        error?.code === '23505' ||
        error?.message?.includes('duplicate key') ||
        error?.message?.includes('UQ_customer_tasks_idempotency_key')
      ) {
        this.logger.log(
          `Concurrent insert collision for idempotencyKey '${dto.idempotencyKey}': fetching existing task and verifying payload`,
        );
        const collisionTask = await this.customerTasksRepository.findOne({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (collisionTask) {
          verifyPayloadMatch(collisionTask);
          return { task: collisionTask, created: false };
        }
      }
      throw err;
    }
  }
}
