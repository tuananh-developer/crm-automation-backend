import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import {
  FollowUpSequenceStatus,
  EnrollmentStatus,
  ExecutionStatus,
} from './enums/follow-up.enum.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { N8nClientService } from '../../infrastructure/n8n/n8n-client.service.js';
import {
  EnrollLeadDto,
  ExecuteFollowUpDto,
  QueryFollowUpExecutionDto,
  UpdateEnrollmentDto,
} from './dto/index.js';

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MINUTES = 10;
export const DEFAULT_FOLLOW_UP_WEBHOOK_PATH = 'follow-up-execute';

const PHONE_CHANNELS = ['SMS', 'WHATSAPP', 'MESSAGE', 'PHONE', 'ZALO'];
const RUNNING_TIMEOUT_MINUTES = 5;

export interface N8nFollowUpResponse {
  success?: boolean;
  providerMessageId?: string | null;
  message?: string;
  error?: string;
}

export interface ExecuteFollowUpResult {
  execution: FollowUpExecution;
  status: ExecutionStatus;
  retryCount: number;
  message: string;
}

export interface EnrollLeadResult {
  enrollment: LeadFollowUpEnrollment;
  execution: FollowUpExecution | null;
  message: string;
}

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    @InjectRepository(LeadFollowUpEnrollment)
    private readonly enrollmentsRepository: Repository<LeadFollowUpEnrollment>,
    @InjectRepository(FollowUpSequence)
    private readonly sequencesRepository: Repository<FollowUpSequence>,
    @InjectRepository(FollowUpStep)
    private readonly stepsRepository: Repository<FollowUpStep>,
    @InjectRepository(FollowUpExecution)
    private readonly executionsRepository: Repository<FollowUpExecution>,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly n8nClientService: N8nClientService,
    private readonly configService: ConfigService,
  ) {}

  async execute(dto: ExecuteFollowUpDto): Promise<ExecuteFollowUpResult> {
    // 1. Load and validate the enrollment
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id: dto.enrollmentId },
      relations: { lead: true },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${dto.enrollmentId}' not found`,
      );
    }

    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new ConflictException(
        `Follow-up enrollment '${enrollment.id}' is '${enrollment.status}' and cannot execute steps`,
      );
    }

    const lead = enrollment.lead;
    if (!lead) {
      throw new NotFoundException(
        `Lead '${enrollment.leadId}' of follow-up enrollment '${enrollment.id}' not found`,
      );
    }

    // 2. Resolve the step to execute (requested step or current step of the enrollment)
    const step = await this.resolveStep(enrollment, dto.stepId);
    if (!step) {
      throw new NotFoundException(
        `No active follow-up step available for enrollment '${enrollment.id}'`,
      );
    }

    const customer = await this.loadCustomer(lead);

    // 3. Validate preconditions of the step
    const failedConditions = this.evaluateConditions(step, lead, customer);
    if (failedConditions.length > 0) {
      throw new BadRequestException(
        `Preconditions of step '${step.id}' are not met: ${failedConditions.join('; ')}`,
      );
    }

    const recipient = this.resolveRecipient(step, lead, customer);
    const maxRetries = this.getMaxRetries();

    // 4. Create (or reuse for retry) the execution record and mark it RUNNING
    const execution = await this.dataSource.transaction(async (manager) => {
      const executionsRepository = manager.getRepository(FollowUpExecution);

      // Serialize concurrent executions of the same step to avoid duplicates
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `follow-up-execution:${enrollment.id}:${step.id}`,
      ]);

      const existing = await executionsRepository.findOne({
        where: { enrollmentId: enrollment.id, stepId: step.id },
        order: { createdAt: 'DESC' },
      });

      if (existing?.status === ExecutionStatus.SUCCESS) {
        throw new ConflictException(
          `Step '${step.id}' of enrollment '${enrollment.id}' has already been executed successfully`,
        );
      }

      if (existing?.status === ExecutionStatus.FAILED) {
        throw new ConflictException(
          `Step '${step.id}' of enrollment '${enrollment.id}' has failed and reached the retry limit of ${maxRetries}`,
        );
      }

      if (existing?.status === ExecutionStatus.RUNNING) {
        throw new ConflictException(
          `Step '${step.id}' of enrollment '${enrollment.id}' is already being executed (execution '${existing.id}')`,
        );
      }

      const startedAt = new Date();

      // Reuse the existing record when retrying so no duplicate execution/history is created
      const record =
        existing ??
        executionsRepository.create({
          enrollmentId: enrollment.id,
          stepId: step.id,
          status: ExecutionStatus.PENDING,
          scheduledAt: startedAt,
          startedAt: null,
          completedAt: null,
          providerMessageId: null,
          requestPayload: null,
          responsePayload: null,
          errorMessage: null,
          retryCount: 0,
        });

      record.status = ExecutionStatus.PENDING;
      record.scheduledAt = record.scheduledAt ?? startedAt;
      await executionsRepository.save(record);

      const variables = this.buildTemplateVariables(lead, customer);
      record.requestPayload = {
        executionId: record.id,
        enrollmentId: enrollment.id,
        stepId: step.id,
        leadId: lead.id,
        lead: {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          companyName: lead.companyName,
        },
        customerId: customer?.id ?? null,
        channel: step.channel,
        actionType: step.actionType,
        stepOrder: step.stepOrder,
        recipient,
        subject: this.renderTemplate(step.subjectTemplate, variables),
        message: this.renderTemplate(step.contentTemplate, variables),
        attempt: record.retryCount + 1,
      };
      record.status = ExecutionStatus.RUNNING;
      record.startedAt = startedAt;
      record.completedAt = null;
      record.errorMessage = null;

      const saved = await executionsRepository.save(record);

      return saved;
    });

    this.logger.log(
      `Executing follow-up step ${step.id} (execution ${execution.id}, attempt ${execution.retryCount + 1})`,
    );

    // 5. Send the execution request to n8n
    let response: N8nFollowUpResponse;
    try {
      response =
        await this.n8nClientService.triggerWebhook<N8nFollowUpResponse>(
          this.getWebhookPath(),
          execution.requestPayload as Record<string, any>,
        );
    } catch (error: unknown) {
      return this.handleFailure(
        execution,
        enrollment,
        step,
        error instanceof Error ? error.message : String(error),
        null,
        maxRetries,
      );
    }

    // 6. Persist the n8n result
    if (!response || response.success !== true) {
      const errorMessage =
        response?.error ??
        response?.message ??
        'n8n returned an unsuccessful follow-up result';

      return this.handleFailure(
        execution,
        enrollment,
        step,
        errorMessage,
        response as Record<string, any> | null,
        maxRetries,
      );
    }

    return this.handleSuccess(execution, enrollment, step, response);
  }

  async findExecutions(
    query: QueryFollowUpExecutionDto,
  ): Promise<FollowUpExecution[]> {
    return this.executionsRepository.find({
      where: {
        ...(query.enrollmentId ? { enrollmentId: query.enrollmentId } : {}),
        ...(query.stepId ? { stepId: query.stepId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingExecutions(): Promise<void> {
    const now = new Date();

    const pendingExecutions = await this.executionsRepository.find({
      where: {
        status: ExecutionStatus.PENDING,
        scheduledAt: LessThanOrEqual(now),
      },
      relations: { enrollment: { lead: true } },
      take: 50,
    });

    if (pendingExecutions.length === 0) {
      return;
    }

    this.logger.log(
      `Processing ${pendingExecutions.length} pending follow-up execution(s)`,
    );

    for (const execution of pendingExecutions) {
      try {
        await this.execute({
          enrollmentId: execution.enrollmentId,
          stepId: execution.stepId,
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to process follow-up execution ${execution.id}: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  async handleStaleRunningExecutions(): Promise<void> {
    const timeoutThreshold = new Date(
      Date.now() - RUNNING_TIMEOUT_MINUTES * 60_000,
    );

    const staleExecutions = await this.executionsRepository.find({
      where: {
        status: ExecutionStatus.RUNNING,
        startedAt: LessThanOrEqual(timeoutThreshold),
      },
      relations: { enrollment: { lead: true } },
    });

    if (staleExecutions.length === 0) {
      return;
    }

    this.logger.warn(
      `Found ${staleExecutions.length} stale RUNNING execution(s), marking as FAILED for retry`,
    );

    for (const execution of staleExecutions) {
      try {
        const enrollment = execution.enrollment;
        if (!enrollment) {
          continue;
        }

        const step = await this.stepsRepository.findOne({
          where: { id: execution.stepId },
        });

        if (!step) {
          continue;
        }

        await this.dataSource.transaction(async (manager) => {
          const executionsRepository = manager.getRepository(FollowUpExecution);
          const auditLogRepository = manager.getRepository(AuditLog);

          const previousStatus = execution.status;
          const previousRetryCount = execution.retryCount;
          const maxRetries = this.getMaxRetries();

          execution.status = ExecutionStatus.FAILED;
          execution.completedAt = new Date();
          execution.errorMessage = `Execution timed out after ${RUNNING_TIMEOUT_MINUTES} minutes`;

          const savedExecution = await executionsRepository.save(execution);

          let retryScheduled = false;
          let retryCount = savedExecution.retryCount;

          if (savedExecution.retryCount < maxRetries) {
            retryCount = savedExecution.retryCount + 1;
            savedExecution.retryCount = retryCount;
            savedExecution.status = ExecutionStatus.RETRYING;
            savedExecution.startedAt = null;
            savedExecution.completedAt = null;
            savedExecution.scheduledAt = new Date(
              Date.now() + this.getRetryDelayMinutes() * 60_000,
            );
            await executionsRepository.save(savedExecution);
            retryScheduled = true;
          }

          await auditLogRepository.save(
            auditLogRepository.create({
              userId: enrollment.assignedBy,
              action: 'FOLLOW_UP_FAILED',
              entityType: 'FollowUpExecution',
              entityId: execution.id,
              oldValue: {
                status: previousStatus,
                retryCount: previousRetryCount,
              },
              newValue: {
                status: savedExecution.status,
                retryCount,
              },
              metadata: {
                enrollmentId: enrollment.id,
                stepId: step.id,
                channel: step.channel,
                attempt: previousRetryCount + 1,
                errorMessage: execution.errorMessage,
                maxRetries,
                retryScheduled,
                staleTimeout: true,
              },
              ipAddress: null,
              userAgent: null,
            }),
          );
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to handle stale execution ${execution.id}: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  async enrollLead(dto: EnrollLeadDto): Promise<EnrollLeadResult> {
    const lead = await this.leadsRepository.findOne({
      where: { id: dto.leadId },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
    }

    const sequence = await this.sequencesRepository.findOne({
      where: { id: dto.sequenceId },
    });

    if (!sequence) {
      throw new NotFoundException(
        `Follow-up sequence with ID '${dto.sequenceId}' not found`,
      );
    }

    if (sequence.status !== FollowUpSequenceStatus.ACTIVE) {
      throw new BadRequestException(
        `Follow-up sequence '${sequence.id}' is '${sequence.status}' and cannot enroll leads`,
      );
    }

    const existingEnrollment = await this.enrollmentsRepository.findOne({
      where: {
        leadId: dto.leadId,
        sequenceId: dto.sequenceId,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    if (existingEnrollment) {
      throw new ConflictException(
        `Lead '${dto.leadId}' is already actively enrolled in sequence '${dto.sequenceId}'`,
      );
    }

    const firstStep = await this.stepsRepository.findOne({
      where: { sequenceId: dto.sequenceId, isActive: true },
      order: { stepOrder: 'ASC' },
    });

    if (!firstStep) {
      throw new BadRequestException(
        `Follow-up sequence '${dto.sequenceId}' has no active steps`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const executionsRepository = manager.getRepository(FollowUpExecution);
      const auditLogRepository = manager.getRepository(AuditLog);

      const now = new Date();

      const enrollment = enrollmentsRepository.create({
        leadId: dto.leadId,
        sequenceId: dto.sequenceId,
        currentStepId: firstStep.id,
        status: EnrollmentStatus.ACTIVE,
        startedAt: now,
        assignedBy: dto.assignedBy ?? null,
      });

      const savedEnrollment = await enrollmentsRepository.save(enrollment);

      const execution = executionsRepository.create({
        enrollmentId: savedEnrollment.id,
        stepId: firstStep.id,
        status: ExecutionStatus.PENDING,
        scheduledAt: now,
        startedAt: null,
        completedAt: null,
        providerMessageId: null,
        requestPayload: null,
        responsePayload: null,
        errorMessage: null,
        retryCount: 0,
      });

      const savedExecution = await executionsRepository.save(execution);

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: dto.assignedBy ?? null,
          action: 'FOLLOW_UP_ENROLLED',
          entityType: 'LeadFollowUpEnrollment',
          entityId: savedEnrollment.id,
          oldValue: null,
          newValue: {
            status: EnrollmentStatus.ACTIVE,
            currentStepId: firstStep.id,
            leadId: dto.leadId,
            sequenceId: dto.sequenceId,
          },
          metadata: {
            leadId: dto.leadId,
            sequenceId: dto.sequenceId,
            firstStepId: firstStep.id,
            scheduledAt: now,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return {
        enrollment: savedEnrollment,
        execution: savedExecution,
        message: `Lead '${dto.leadId}' enrolled in sequence '${dto.sequenceId}'. First step scheduled.`,
      };
    });
  }

  async pauseEnrollment(
    id: string,
    dto: UpdateEnrollmentDto,
  ): Promise<LeadFollowUpEnrollment> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${id}' not found`,
      );
    }

    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new ConflictException(
        `Enrollment '${id}' is '${enrollment.status}' and cannot be paused`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const auditLogRepository = manager.getRepository(AuditLog);

      const previousStatus = enrollment.status;

      enrollment.status = EnrollmentStatus.PAUSED;
      enrollment.pausedAt = new Date();
      if (dto.reason) {
        enrollment.cancellationReason = dto.reason;
      }

      const savedEnrollment = await enrollmentsRepository.save(enrollment);

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: enrollment.assignedBy,
          action: 'FOLLOW_UP_PAUSED',
          entityType: 'LeadFollowUpEnrollment',
          entityId: enrollment.id,
          oldValue: { status: previousStatus },
          newValue: {
            status: EnrollmentStatus.PAUSED,
            pausedAt: savedEnrollment.pausedAt,
          },
          metadata: {
            enrollmentId: enrollment.id,
            reason: dto.reason ?? null,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return savedEnrollment;
    });
  }

  async resumeEnrollment(id: string): Promise<LeadFollowUpEnrollment> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${id}' not found`,
      );
    }

    if (enrollment.status !== EnrollmentStatus.PAUSED) {
      throw new ConflictException(
        `Enrollment '${id}' is '${enrollment.status}' and cannot be resumed`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const auditLogRepository = manager.getRepository(AuditLog);

      const previousStatus = enrollment.status;

      enrollment.status = EnrollmentStatus.ACTIVE;
      enrollment.pausedAt = null;

      const savedEnrollment = await enrollmentsRepository.save(enrollment);

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: enrollment.assignedBy,
          action: 'FOLLOW_UP_RESUMED',
          entityType: 'LeadFollowUpEnrollment',
          entityId: enrollment.id,
          oldValue: { status: previousStatus },
          newValue: { status: EnrollmentStatus.ACTIVE },
          metadata: {
            enrollmentId: enrollment.id,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return savedEnrollment;
    });
  }

  async cancelEnrollment(
    id: string,
    dto: UpdateEnrollmentDto,
  ): Promise<LeadFollowUpEnrollment> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${id}' not found`,
      );
    }

    if (
      enrollment.status === EnrollmentStatus.CANCELLED ||
      enrollment.status === EnrollmentStatus.COMPLETED
    ) {
      throw new ConflictException(
        `Enrollment '${id}' is '${enrollment.status}' and cannot be cancelled`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const auditLogRepository = manager.getRepository(AuditLog);

      const previousStatus = enrollment.status;

      enrollment.status = EnrollmentStatus.CANCELLED;
      enrollment.cancelledAt = new Date();
      enrollment.cancellationReason = dto.reason ?? null;

      const savedEnrollment = await enrollmentsRepository.save(enrollment);

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: enrollment.assignedBy,
          action: 'FOLLOW_UP_CANCELLED',
          entityType: 'LeadFollowUpEnrollment',
          entityId: enrollment.id,
          oldValue: { status: previousStatus },
          newValue: {
            status: EnrollmentStatus.CANCELLED,
            cancelledAt: savedEnrollment.cancelledAt,
            cancellationReason: dto.reason ?? null,
          },
          metadata: {
            enrollmentId: enrollment.id,
            reason: dto.reason ?? null,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return savedEnrollment;
    });
  }

  private async handleSuccess(
    execution: FollowUpExecution,
    enrollment: LeadFollowUpEnrollment,
    step: FollowUpStep,
    response: N8nFollowUpResponse,
  ): Promise<ExecuteFollowUpResult> {
    const completedAt = new Date();

    const outcome = await this.dataSource.transaction(async (manager) => {
      const executionsRepository = manager.getRepository(FollowUpExecution);
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const stepsRepository = manager.getRepository(FollowUpStep);
      const auditLogRepository = manager.getRepository(AuditLog);

      const previousStatus = execution.status;

      execution.status = ExecutionStatus.SUCCESS;
      execution.completedAt = completedAt;
      execution.providerMessageId = response.providerMessageId ?? null;
      execution.responsePayload = response as Record<string, any>;
      execution.errorMessage = null;

      const savedExecution = await executionsRepository.save(execution);

      // Advance the enrollment to the next step, or complete the sequence
      const nextStep = await stepsRepository.findOne({
        where: {
          sequenceId: enrollment.sequenceId,
          stepOrder: MoreThan(step.stepOrder),
          isActive: true,
        },
        order: { stepOrder: 'ASC' },
      });

      if (nextStep) {
        enrollment.currentStepId = nextStep.id;

        const alreadyScheduled = await executionsRepository.findOne({
          where: { enrollmentId: enrollment.id, stepId: nextStep.id },
        });

        if (!alreadyScheduled) {
          await executionsRepository.save(
            executionsRepository.create({
              enrollmentId: enrollment.id,
              stepId: nextStep.id,
              status: ExecutionStatus.PENDING,
              scheduledAt: new Date(
                completedAt.getTime() + nextStep.delayMinutes * 60_000,
              ),
              startedAt: null,
              completedAt: null,
              providerMessageId: null,
              requestPayload: null,
              responsePayload: null,
              errorMessage: null,
              retryCount: 0,
            }),
          );
        }
      } else {
        enrollment.status = EnrollmentStatus.COMPLETED;
        enrollment.completedAt = completedAt;
      }

      const savedEnrollment = await enrollmentsRepository.save(enrollment);

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: enrollment.assignedBy,
          action: 'FOLLOW_UP_EXECUTED',
          entityType: 'FollowUpExecution',
          entityId: execution.id,
          oldValue: {
            status: previousStatus,
            enrollmentStatus: null,
          },
          newValue: {
            status: savedExecution.status,
            enrollmentStatus: savedEnrollment.status,
            currentStepId: savedEnrollment.currentStepId,
          },
          metadata: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            channel: step.channel,
            attempt: execution.retryCount + 1,
            providerMessageId: execution.providerMessageId,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return { execution: savedExecution, hasNextStep: Boolean(nextStep) };
    });

    this.logger.log(
      `Follow-up execution ${outcome.execution.id} succeeded for enrollment ${enrollment.id}`,
    );

    return {
      execution: outcome.execution,
      status: outcome.execution.status,
      retryCount: outcome.execution.retryCount,
      message: `Follow-up step '${step.id}' executed successfully.${outcome.hasNextStep ? ' Next step scheduled.' : ' Enrollment completed.'}`,
    };
  }

  private async handleFailure(
    execution: FollowUpExecution,
    enrollment: LeadFollowUpEnrollment,
    step: FollowUpStep,
    errorMessage: string,
    responsePayload: Record<string, any> | null,
    maxRetries: number,
  ): Promise<ExecuteFollowUpResult> {
    const failedAt = new Date();

    const outcome = await this.dataSource.transaction(async (manager) => {
      const executionsRepository = manager.getRepository(FollowUpExecution);
      const auditLogRepository = manager.getRepository(AuditLog);

      const previousStatus = execution.status;
      const previousRetryCount = execution.retryCount;

      // RUNNING -> FAILED
      execution.status = ExecutionStatus.FAILED;
      execution.completedAt = failedAt;
      execution.errorMessage = errorMessage;
      execution.responsePayload = responsePayload;

      const savedExecution = await executionsRepository.save(execution);

      let retryScheduled = false;
      let retryCount = savedExecution.retryCount;

      // FAILED -> RETRYING (bounded by max retries)
      if (savedExecution.retryCount < maxRetries) {
        retryCount = savedExecution.retryCount + 1;
        savedExecution.retryCount = retryCount;
        savedExecution.status = ExecutionStatus.RETRYING;
        savedExecution.startedAt = null;
        savedExecution.completedAt = null;
        savedExecution.scheduledAt = new Date(
          failedAt.getTime() + this.getRetryDelayMinutes() * 60_000,
        );
        await executionsRepository.save(savedExecution);
        retryScheduled = true;
      }

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: enrollment.assignedBy,
          action: 'FOLLOW_UP_FAILED',
          entityType: 'FollowUpExecution',
          entityId: execution.id,
          oldValue: {
            status: previousStatus,
            retryCount: previousRetryCount,
          },
          newValue: {
            status: savedExecution.status,
            retryCount,
          },
          metadata: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            channel: step.channel,
            attempt: previousRetryCount + 1,
            errorMessage,
            maxRetries,
            retryScheduled,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return { execution: savedExecution, retryScheduled };
    });

    this.logger.warn(
      `Follow-up execution ${outcome.execution.id} failed for enrollment ${enrollment.id}: ${errorMessage}`,
    );

    return {
      execution: outcome.execution,
      status: outcome.execution.status,
      retryCount: outcome.execution.retryCount,
      message: outcome.retryScheduled
        ? `Follow-up execution failed: ${errorMessage}. Retry ${outcome.execution.retryCount}/${maxRetries} is scheduled.`
        : `Follow-up execution failed: ${errorMessage}. Retry limit of ${maxRetries} reached.`,
    };
  }

  private async resolveStep(
    enrollment: LeadFollowUpEnrollment,
    requestedStepId?: string,
  ): Promise<FollowUpStep | null> {
    if (requestedStepId) {
      const step = await this.stepsRepository.findOne({
        where: { id: requestedStepId },
      });

      if (!step) {
        throw new NotFoundException(
          `FollowUpStep with ID '${requestedStepId}' not found`,
        );
      }

      if (step.sequenceId !== enrollment.sequenceId) {
        throw new BadRequestException(
          `Step '${step.id}' does not belong to sequence '${enrollment.sequenceId}' of enrollment '${enrollment.id}'`,
        );
      }

      if (!step.isActive) {
        throw new BadRequestException(`Step '${step.id}' is inactive`);
      }

      return step;
    }

    if (enrollment.currentStepId) {
      return this.stepsRepository.findOne({
        where: { id: enrollment.currentStepId, isActive: true },
      });
    }

    return this.stepsRepository.findOne({
      where: { sequenceId: enrollment.sequenceId, isActive: true },
      order: { stepOrder: 'ASC' },
    });
  }

  private async loadCustomer(lead: Lead): Promise<Customer | null> {
    if (!lead.convertedCustomerId) {
      return null;
    }

    return this.customersRepository.findOne({
      where: { id: lead.convertedCustomerId },
    });
  }

  private resolveRecipient(
    step: FollowUpStep,
    lead: Lead,
    customer: Customer | null,
  ): string {
    const channel = (step.channel ?? '').toUpperCase();

    if (PHONE_CHANNELS.includes(channel)) {
      const phone = lead.phone ?? customer?.phone;
      if (!phone) {
        throw new BadRequestException(
          `Step '${step.id}' uses channel '${step.channel}' but lead '${lead.id}' has no phone number`,
        );
      }
      return phone;
    }

    const email = lead.email ?? customer?.email;
    if (!email) {
      throw new BadRequestException(
        `Step '${step.id}' uses channel '${step.channel}' but lead '${lead.id}' has no email address`,
      );
    }

    return email;
  }

  buildTemplateVariables(
    lead: Lead,
    customer: Customer | null,
  ): Record<string, string> {
    return {
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      fullName: [lead.firstName, lead.lastName]
        .filter((part) => Boolean(part))
        .join(' '),
      email: lead.email ?? customer?.email ?? '',
      phone: lead.phone ?? customer?.phone ?? '',
      companyName: lead.companyName ?? customer?.companyName ?? '',
      companyWebsite: lead.companyWebsite ?? customer?.companyWebsite ?? '',
      jobTitle: lead.jobTitle ?? customer?.jobTitle ?? '',
      companySize: String(lead.companySize ?? customer?.companySize ?? ''),
      industry: lead.industry ?? customer?.industry ?? '',
      notes: lead.notes ?? customer?.notes ?? '',
      customerName: customer?.name ?? '',
      leadId: lead.id,
      customerId: customer?.id ?? '',
    };
  }

  renderTemplate(
    template: string | null,
    variables: Record<string, string>,
  ): string {
    if (!template) {
      return '';
    }

    return template.replace(
      /\{\{\s*([\w.]+)\s*\}\}/g,
      (_match: string, key: string) => variables[key] ?? '',
    );
  }

  private evaluateConditions(
    step: FollowUpStep,
    lead: Lead,
    customer: Customer | null,
  ): string[] {
    const conditions = step.conditions;
    if (!conditions) {
      return [];
    }

    const conditionList = (
      Array.isArray(conditions)
        ? conditions
        : Array.isArray(conditions.conditions)
          ? conditions.conditions
          : [conditions]
    ) as unknown[];

    const failed: string[] = [];

    for (const entry of conditionList) {
      const condition = entry as Record<string, unknown>;
      const field = condition?.field;
      const operator =
        typeof condition?.operator === 'string' ? condition.operator : 'equals';
      const expected = condition?.value;

      if (typeof field !== 'string' || !field) {
        continue;
      }

      const actual = this.resolveConditionValue(field, lead, customer);

      if (!this.compare(actual, operator, expected)) {
        failed.push(
          `${field} ${operator} ${JSON.stringify(expected ?? null)} (actual: ${JSON.stringify(actual ?? null)})`,
        );
      }
    }

    return failed;
  }

  private resolveConditionValue(
    field: string,
    lead: Lead,
    customer: Customer | null,
  ): unknown {
    if (field.startsWith('lead.') || field.startsWith('customer.')) {
      const [scope, property] = field.split('.');
      const source = scope === 'customer' ? customer : lead;
      return source
        ? (source as unknown as Record<string, unknown>)[property]
        : null;
    }

    const leadValue = (lead as unknown as Record<string, unknown>)[field];
    if (leadValue !== undefined && leadValue !== null) {
      return leadValue;
    }

    return customer
      ? (customer as unknown as Record<string, unknown>)[field]
      : null;
  }

  private compare(
    actual: unknown,
    operator: string,
    expected: unknown,
  ): boolean {
    switch (operator) {
      case 'equals':
      case 'eq':
        return actual === expected;
      case 'not_equals':
      case 'neq':
        return actual !== expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'contains':
        return this.stringifyValue(actual)
          .toLowerCase()
          .includes(this.stringifyValue(expected).toLowerCase());
      case 'exists':
        return actual !== null && actual !== undefined;
      case 'not_exists':
        return actual === null || actual === undefined;
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      default:
        return true;
    }
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value) ?? '';
  }

  private getWebhookPath(): string {
    return (
      this.configService.get<string>('N8N_FOLLOW_UP_WEBHOOK_PATH') ||
      DEFAULT_FOLLOW_UP_WEBHOOK_PATH
    );
  }

  private getMaxRetries(): number {
    return this.configService.get<number>(
      'FOLLOW_UP_MAX_RETRIES',
      DEFAULT_MAX_RETRIES,
    );
  }

  private getRetryDelayMinutes(): number {
    return this.configService.get<number>(
      'FOLLOW_UP_RETRY_DELAY_MINUTES',
      DEFAULT_RETRY_DELAY_MINUTES,
    );
  }
}
