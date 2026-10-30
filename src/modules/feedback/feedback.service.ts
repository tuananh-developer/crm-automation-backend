import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CustomerFeedback,
  FeedbackStatus,
} from './entities/customer-feedback.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import {
  CreateCustomerTaskDto,
  CreateFeedbackDto,
  FeedbackCallbackDto,
} from './dto/index.js';

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
  ) {}

  public redactSensitiveContent(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[REDACTED_EMAIL]',
      )
      .replace(
        /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
        '[REDACTED_PHONE]',
      )
      .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[REDACTED_CARD]');
  }

  async createFeedback(dto: CreateFeedbackDto) {
    const customer = await this.customersRepository.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${dto.customerId} not found`);
    }

    const safeContent = this.redactSensitiveContent(dto.content);

    const feedback = this.feedbackRepository.create({
      customerId: dto.customerId,
      source: dto.source || 'WEB',
      content: safeContent,
      rating: dto.rating ?? null,
      status: FeedbackStatus.NEW,
      receivedAt: new Date(),
    });

    const savedFeedback = await this.feedbackRepository.save(feedback);

    // Create correlated WorkflowRun
    const workflowRun = this.workflowRunsRepository.create({
      workflowName: 't12-wf14-customer-feedback',
      customerId: customer.id,
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
  ) {
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
      safeContent,
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
        `T12-WF14 successfully dispatched to n8n webhook: ${url}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Error dispatching T12-WF14: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getFeedback(id: string) {
    const feedback = await this.feedbackRepository.findOne({
      where: { id },
      relations: { customer: true },
    });
    if (!feedback) {
      throw new NotFoundException(`Customer feedback ${id} not found`);
    }
    return feedback;
  }

  async getCustomerFeedback(customerId: string) {
    return this.feedbackRepository.find({
      where: { customerId },
      order: { receivedAt: 'DESC' },
    });
  }

  async handleCallback(dto: FeedbackCallbackDto) {
    this.logger.log(
      `Received T12-WF14 callback for feedback ${dto.feedbackId}, status=${dto.status}`,
    );

    const feedback = await this.feedbackRepository.findOne({
      where: { id: dto.feedbackId },
    });
    if (!feedback) {
      throw new NotFoundException(`Feedback ${dto.feedbackId} not found`);
    }

    const isSuccess = dto.status === 'SUCCESS';
    if (isSuccess) {
      feedback.sentiment = dto.sentiment ?? 'NEUTRAL';
      feedback.category = dto.category ?? 'General Feedback';
      feedback.urgency = dto.urgency ?? 'LOW';
      feedback.status = dto.escalationRequired
        ? FeedbackStatus.ESCALATED
        : FeedbackStatus.PROCESSED;
      feedback.rawAIOutput = dto.rawAIOutput ?? null;
    }
    await this.feedbackRepository.save(feedback);

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
        sentiment: dto.sentiment,
        category: dto.category,
        urgency: dto.urgency,
        escalationRequired: dto.escalationRequired,
        rawAIOutput: dto.rawAIOutput,
      };
      await this.workflowRunsRepository.save(workflowRun);
    }

    return {
      success: isSuccess,
      feedbackId: feedback.id,
      status: feedback.status,
      escalationRequired: Boolean(dto.escalationRequired),
    };
  }

  /**
   * Idempotently creates or returns existing operational task linked to Customer/Feedback.
   */
  async ensureCustomerTask(dto: CreateCustomerTaskDto) {
    const existing = await this.customerTasksRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      this.logger.log(
        `CustomerTask with idempotencyKey '${dto.idempotencyKey}' already exists: returning existing task ${existing.id}`,
      );
      return { task: existing, created: false };
    }

    const task = this.customerTasksRepository.create({
      customerId: dto.customerId,
      taskType: dto.taskType,
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority,
      status: dto.status,
      assignedTo: dto.assignedTo ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      idempotencyKey: dto.idempotencyKey,
      sourceEntityType: dto.sourceEntityType ?? 'CUSTOMER_FEEDBACK',
      sourceEntityId: dto.sourceEntityId ?? null,
    });

    const saved = await this.customerTasksRepository.save(task);
    this.logger.log(
      `Created new CustomerTask ${saved.id} for customer ${dto.customerId}`,
    );
    return { task: saved, created: true };
  }
}
