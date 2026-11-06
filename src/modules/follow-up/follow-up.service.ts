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
import {
  DataSource,
  In,
  LessThanOrEqual,
  MoreThan,
  Repository,
  type EntityManager,
} from 'typeorm';
import { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { LeadFollowUpEnrollmentResponseDto } from './dto/lead-follow-up-enrollment-response.dto';
import { FollowUpExecutionResponseDto } from './dto/follow-up-execution-response.dto.js';
import { FollowUpExecutionMapper } from './mappers/follow-up-execution.mapper.js';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
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
import type {
  ExecuteFollowUpResult,
  N8nFollowUpResponse,
} from './interfaces/index.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MINUTES = 10;
export const DEFAULT_FOLLOW_UP_WEBHOOK_PATH = 'follow-up-execute';

const PHONE_CHANNELS = ['SMS', 'WHATSAPP', 'MESSAGE', 'PHONE', 'ZALO'];
const RUNNING_TIMEOUT_MINUTES = 5;

export type { N8nFollowUpResponse, ExecuteFollowUpResult };

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

  async execute(
    dto: ExecuteFollowUpDto,
    actor?: AuthenticatedUser,
  ): Promise<ExecuteFollowUpResult> {
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
    if (actor) this.assertLeadAccess(lead, actor);

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

      const lockedEnrollment = await this.findLockedEnrollment(
        manager,
        enrollment.id,
        actor,
      );
      if (lockedEnrollment.status !== EnrollmentStatus.ACTIVE) {
        throw new ConflictException(
          `Follow-up enrollment '${lockedEnrollment.id}' is '${lockedEnrollment.status}' and cannot execute steps`,
        );
      }

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
          execution.requestPayload as Record<string, unknown>,
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
        response as Record<string, unknown> | null,
        maxRetries,
      );
    }

    return this.handleSuccess(execution, enrollment, step, response);
  }

  async findExecutions(
    query: QueryFollowUpExecutionDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<FollowUpExecutionResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [executions, total] = await this.executionsRepository.findAndCount({
      where: {
        ...(query.enrollmentId ? { enrollmentId: query.enrollmentId } : {}),
        ...(query.stepId ? { stepId: query.stepId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(actor.role === UserRole.SALES
          ? { enrollment: { lead: { ownerId: actor.id } } }
          : {}),
      },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      data: FollowUpExecutionMapper.toResponseDtoArray(executions),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingExecutions(): Promise<void> {
    const now = new Date();

    const pendingExecutions = await this.executionsRepository.find({
      where: {
        status: In([ExecutionStatus.PENDING, ExecutionStatus.RETRYING]),
        scheduledAt: LessThanOrEqual(now),
        enrollment: { status: EnrollmentStatus.ACTIVE },
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

  @Cron(CronExpression.EVERY_5_MINUTES)
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
      `Found ${staleExecutions.length} stale RUNNING execution(s), marking them for recovery`,
    );

    for (const candidate of staleExecutions) {
      try {
        await this.dataSource.transaction(async (manager) => {
          // Keep a consistent lock order (enrollment -> execution) with the
          // normal execution and lifecycle paths to avoid PostgreSQL deadlocks.
          const enrollment = await this.findLockedEnrollment(
            manager,
            candidate.enrollmentId,
          );
          const executionsRepository = manager.getRepository(FollowUpExecution);
          const auditLogRepository = manager.getRepository(AuditLog);
          const execution = await executionsRepository.findOne({
            where: { id: candidate.id },
            lock: { mode: 'pessimistic_write' },
          });

          // Another worker may have completed or reclaimed this execution
          // after the initial batch query. Only one worker may recover it.
          if (
            !execution ||
            execution.status !== ExecutionStatus.RUNNING ||
            !execution.startedAt ||
            execution.startedAt > timeoutThreshold
          ) {
            return;
          }
          const step = await manager.getRepository(FollowUpStep).findOne({
            where: { id: execution.stepId },
          });
          if (!step) {
            return;
          }

          const previousStatus = execution.status;
          const previousRetryCount = execution.retryCount;
          const maxRetries = this.getMaxRetries();

          execution.status = ExecutionStatus.FAILED;
          execution.completedAt = new Date();
          execution.errorMessage = `Execution timed out after ${RUNNING_TIMEOUT_MINUTES} minutes`;

          let retryScheduled = false;
          let retryCount = execution.retryCount;
          if (
            enrollment.status !== EnrollmentStatus.CANCELLED &&
            enrollment.status !== EnrollmentStatus.COMPLETED &&
            execution.retryCount < maxRetries
          ) {
            retryCount = execution.retryCount + 1;
            execution.retryCount = retryCount;
            execution.status = ExecutionStatus.RETRYING;
            execution.startedAt = null;
            execution.completedAt = null;
            execution.scheduledAt = new Date(
              Date.now() + this.getRetryDelayMinutes() * 60_000,
            );
            retryScheduled = true;
          }

          const savedExecution = await executionsRepository.save(execution);
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
          `Failed to handle stale execution ${candidate.id}: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  async enrollLead(
    dto: EnrollLeadDto,
    actor: AuthenticatedUser,
  ): Promise<LeadFollowUpEnrollmentResponseDto> {
    const lead = await this.leadsRepository.findOne({
      where: { id: dto.leadId },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
    }
    this.assertLeadAccess(lead, actor);

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
        assignedBy: actor.id,
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

      await executionsRepository.save(execution);

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: actor.id,
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

      const responseDto = new LeadFollowUpEnrollmentResponseDto();
      responseDto.id = savedEnrollment.id;
      responseDto.leadId = savedEnrollment.leadId;
      responseDto.sequenceId = savedEnrollment.sequenceId;
      responseDto.currentStepId = savedEnrollment.currentStepId ?? null;
      responseDto.status = savedEnrollment.status;
      responseDto.startedAt = savedEnrollment.startedAt;
      responseDto.pausedAt = savedEnrollment.pausedAt ?? null;
      responseDto.completedAt = savedEnrollment.completedAt ?? null;
      responseDto.cancelledAt = savedEnrollment.cancelledAt ?? null;
      responseDto.assignedBy = savedEnrollment.assignedBy ?? null;
      responseDto.cancellationReason =
        savedEnrollment.cancellationReason ?? null;
      responseDto.createdAt = savedEnrollment.createdAt;
      responseDto.updatedAt = savedEnrollment.updatedAt;
      responseDto.executionCount = 1;
      // Optional relations: we are not loading them, so leave undefined
      // lead, sequence, currentStep, assignedByUser are optional and we leave them undefined
      return responseDto;
    });
  }
  async pauseEnrollment(
    id: string,
    dto: UpdateEnrollmentDto,
    actor?: AuthenticatedUser,
  ): Promise<LeadFollowUpEnrollment> {
    const existing = await this.enrollmentsRepository.findOne({
      where: { id },
      relations: { executions: true, lead: true },
    });
    if (!existing) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${id}' not found`,
      );
    }
    if (actor) this.assertEnrollmentAccess(existing, actor);

    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const auditLogRepository = manager.getRepository(AuditLog);
      const enrollment = await this.findLockedEnrollment(manager, id, actor);

      if (enrollment.status !== EnrollmentStatus.ACTIVE) {
        throw new ConflictException(
          `Enrollment '${id}' is '${enrollment.status}' and cannot be paused`,
        );
      }

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

  async resumeEnrollment(
    id: string,
    actor?: AuthenticatedUser,
  ): Promise<LeadFollowUpEnrollment> {
    const existing = await this.enrollmentsRepository.findOne({
      where: { id },
      relations: { executions: true, lead: true },
    });
    if (!existing) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${id}' not found`,
      );
    }
    if (actor) this.assertEnrollmentAccess(existing, actor);

    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const auditLogRepository = manager.getRepository(AuditLog);
      const enrollment = await this.findLockedEnrollment(manager, id, actor);

      if (enrollment.status !== EnrollmentStatus.PAUSED) {
        throw new ConflictException(
          `Enrollment '${id}' is '${enrollment.status}' and cannot be resumed`,
        );
      }

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
    actor?: AuthenticatedUser,
  ): Promise<LeadFollowUpEnrollment> {
    const existing = await this.enrollmentsRepository.findOne({
      where: { id },
      relations: { executions: true, lead: true },
    });
    if (!existing) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${id}' not found`,
      );
    }
    if (actor) this.assertEnrollmentAccess(existing, actor);

    return this.dataSource.transaction(async (manager) => {
      const enrollmentsRepository = manager.getRepository(
        LeadFollowUpEnrollment,
      );
      const auditLogRepository = manager.getRepository(AuditLog);
      const enrollment = await this.findLockedEnrollment(manager, id, actor);

      if (
        enrollment.status === EnrollmentStatus.CANCELLED ||
        enrollment.status === EnrollmentStatus.COMPLETED
      ) {
        throw new ConflictException(
          `Enrollment '${id}' is '${enrollment.status}' and cannot be cancelled`,
        );
      }

      const previousStatus = enrollment.status;
      enrollment.status = EnrollmentStatus.CANCELLED;
      enrollment.cancelledAt = new Date();
      enrollment.cancellationReason = dto.reason ?? null;
      const savedEnrollment = await enrollmentsRepository.save(enrollment);
      await manager.getRepository(FollowUpExecution).update(
        {
          enrollmentId: enrollment.id,
          status: In([ExecutionStatus.PENDING, ExecutionStatus.RETRYING]),
        },
        {
          status: ExecutionStatus.SKIPPED,
          completedAt: new Date(),
          errorMessage: 'Enrollment cancelled before execution started',
        },
      );

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

  private async findLockedEnrollment(
    manager: EntityManager,
    id: string,
    actor?: AuthenticatedUser,
  ): Promise<LeadFollowUpEnrollment> {
    const enrollment = await manager
      .getRepository(LeadFollowUpEnrollment)
      .findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

    if (!enrollment) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${id}' not found`,
      );
    }

    if (actor?.role === UserRole.SALES) {
      const lead = await manager.getRepository(Lead).findOne({
        where: { id: enrollment.leadId },
        select: { id: true, ownerId: true },
      });
      if (!lead || lead.ownerId !== actor.id) {
        throw new NotFoundException(
          `Follow-up enrollment with ID '${id}' not found`,
        );
      }
    }

    return enrollment;
  }

  private async findLockedExecution(
    manager: EntityManager,
    id: string,
  ): Promise<FollowUpExecution> {
    const executionRepository = manager.getRepository(FollowUpExecution);
    const execution = await executionRepository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!execution) {
      throw new NotFoundException(
        `Follow-up execution with ID '${id}' not found`,
      );
    }
    return execution;
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
      const currentEnrollment = await this.findLockedEnrollment(
        manager,
        enrollment.id,
      );
      const currentExecution = await this.findLockedExecution(
        manager,
        execution.id,
      );

      if (currentExecution.status === ExecutionStatus.SUCCESS) {
        return {
          execution: currentExecution,
          hasNextStep: false,
          enrollmentStatus: currentEnrollment.status,
          alreadyProcessed: true,
        };
      }
      if (currentExecution.status !== ExecutionStatus.RUNNING) {
        throw new ConflictException(
          `Follow-up execution '${currentExecution.id}' is '${currentExecution.status}' and cannot be completed`,
        );
      }

      const previousStatus = currentExecution.status;
      const enrollmentStatusAtCompletion = currentEnrollment.status;
      currentExecution.status = ExecutionStatus.SUCCESS;
      currentExecution.completedAt = completedAt;
      currentExecution.providerMessageId = response.providerMessageId ?? null;
      currentExecution.responsePayload = response as Record<string, unknown>;
      currentExecution.errorMessage = null;
      const savedExecution = await executionsRepository.save(currentExecution);

      // A successful in-flight delivery must never reactivate a cancelled
      // enrollment. For PAUSED enrollments, persist the next step but leave it
      // pending until the owner explicitly resumes the enrollment.
      let nextStep: FollowUpStep | null = null;
      if (
        currentEnrollment.status === EnrollmentStatus.ACTIVE ||
        currentEnrollment.status === EnrollmentStatus.PAUSED
      ) {
        nextStep = await stepsRepository.findOne({
          where: {
            sequenceId: currentEnrollment.sequenceId,
            stepOrder: MoreThan(step.stepOrder),
            isActive: true,
          },
          order: { stepOrder: 'ASC' },
        });
      }

      if (nextStep) {
        currentEnrollment.currentStepId = nextStep.id;
        const alreadyScheduled = await executionsRepository.findOne({
          where: {
            enrollmentId: currentEnrollment.id,
            stepId: nextStep.id,
          },
        });

        if (!alreadyScheduled) {
          await executionsRepository.save(
            executionsRepository.create({
              enrollmentId: currentEnrollment.id,
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
      } else if (
        currentEnrollment.status === EnrollmentStatus.ACTIVE ||
        currentEnrollment.status === EnrollmentStatus.PAUSED
      ) {
        // The in-flight final step completed successfully; there is no work
        // left to resume, so completion is the terminal business state.
        currentEnrollment.status = EnrollmentStatus.COMPLETED;
        currentEnrollment.completedAt = completedAt;
      }

      const savedEnrollment = await enrollmentsRepository.save(
        currentEnrollment,
      );

      await auditLogRepository.save(
        auditLogRepository.create({
          userId: currentEnrollment.assignedBy,
          action: 'FOLLOW_UP_EXECUTED',
          entityType: 'FollowUpExecution',
          entityId: savedExecution.id,
          oldValue: {
            status: previousStatus,
            enrollmentStatus: enrollmentStatusAtCompletion,
          },
          newValue: {
            status: savedExecution.status,
            enrollmentStatus: savedEnrollment.status,
            currentStepId: savedEnrollment.currentStepId,
          },
          metadata: {
            enrollmentId: currentEnrollment.id,
            stepId: step.id,
            channel: step.channel,
            attempt: currentExecution.retryCount + 1,
            providerMessageId: currentExecution.providerMessageId,
            enrollmentWasPaused:
              enrollmentStatusAtCompletion === EnrollmentStatus.PAUSED,
            enrollmentWasCancelled:
              enrollmentStatusAtCompletion === EnrollmentStatus.CANCELLED,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return {
        execution: savedExecution,
        hasNextStep: Boolean(nextStep),
        enrollmentStatus: savedEnrollment.status,
        alreadyProcessed: false,
      };
    });

    this.logger.log(
      `Follow-up execution ${outcome.execution.id} succeeded for enrollment ${enrollment.id}`,
    );

    const completionMessage = outcome.alreadyProcessed
      ? ' This execution was already finalized; no additional changes were made.'
      : outcome.enrollmentStatus === EnrollmentStatus.CANCELLED
        ? ' The enrollment remains cancelled; no further steps were scheduled.'
        : outcome.hasNextStep
          ? ' Next step scheduled.'
          : ' Enrollment completed.';

    return {
      execution: outcome.execution,
      status: outcome.execution.status,
      retryCount: outcome.execution.retryCount,
      message: `Follow-up step '${step.id}' executed successfully.${completionMessage}`,
    };
  }

  private async handleFailure(
    execution: FollowUpExecution,
    enrollment: LeadFollowUpEnrollment,
    step: FollowUpStep,
    errorMessage: string,
    responsePayload: Record<string, unknown> | null,
    maxRetries: number,
  ): Promise<ExecuteFollowUpResult> {
    const failedAt = new Date();

    const outcome = await this.dataSource.transaction(async (manager) => {
      const executionsRepository = manager.getRepository(FollowUpExecution);
      const auditLogRepository = manager.getRepository(AuditLog);
      const currentEnrollment = await this.findLockedEnrollment(
        manager,
        enrollment.id,
      );
      const currentExecution = await this.findLockedExecution(
        manager,
        execution.id,
      );

      // A timeout/recovery worker or duplicate callback may already have
      // finalized this attempt. Never overwrite a newer state from a stale
      // in-memory execution object.
      if (currentExecution.status !== ExecutionStatus.RUNNING) {
        return {
          execution: currentExecution,
          retryScheduled: currentExecution.status === ExecutionStatus.RETRYING,
          alreadyProcessed: true,
        };
      }

      const previousStatus = currentExecution.status;
      const previousRetryCount = currentExecution.retryCount;

      currentExecution.status = ExecutionStatus.FAILED;
      currentExecution.completedAt = failedAt;
      currentExecution.errorMessage = errorMessage;
      currentExecution.responsePayload = responsePayload;

      let retryScheduled = false;
      let retryCount = currentExecution.retryCount;

      if (
        currentExecution.retryCount < maxRetries &&
        currentEnrollment.status !== EnrollmentStatus.CANCELLED &&
        currentEnrollment.status !== EnrollmentStatus.COMPLETED
      ) {
        retryCount = currentExecution.retryCount + 1;
        currentExecution.retryCount = retryCount;
        currentExecution.status = ExecutionStatus.RETRYING;
        currentExecution.startedAt = null;
        currentExecution.completedAt = null;
        currentExecution.scheduledAt = new Date(
          failedAt.getTime() + this.getRetryDelayMinutes() * 60_000,
        );
        retryScheduled = true;
      }

      const savedExecution = await executionsRepository.save(currentExecution);
      await auditLogRepository.save(
        auditLogRepository.create({
          userId: currentEnrollment.assignedBy,
          action: 'FOLLOW_UP_FAILED',
          entityType: 'FollowUpExecution',
          entityId: savedExecution.id,
          oldValue: {
            status: previousStatus,
            retryCount: previousRetryCount,
          },
          newValue: {
            status: savedExecution.status,
            retryCount,
          },
          metadata: {
            enrollmentId: currentEnrollment.id,
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

      return {
        execution: savedExecution,
        retryScheduled,
        alreadyProcessed: false,
      };
    });

    this.logger.warn(
      `Follow-up execution ${outcome.execution.id} failed for enrollment ${enrollment.id}: ${errorMessage}`,
    );

    return {
      execution: outcome.execution,
      status: outcome.execution.status,
      retryCount: outcome.execution.retryCount,
      message: outcome.alreadyProcessed
        ? `Follow-up execution was already finalized as ${outcome.execution.status}; no additional retry was created.`
        : outcome.retryScheduled
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

    const conditionList: unknown[] = Array.isArray(conditions)
      ? conditions
      : Array.isArray(conditions.conditions)
        ? conditions.conditions
        : [conditions];

    const failed: string[] = [];

    for (const entry of conditionList) {
      if (!this.isRecord(entry)) {
        continue;
      }

      const condition = entry;
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
    const leadFields: Record<string, unknown> = {
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName,
      companyWebsite: lead.companyWebsite,
      jobTitle: lead.jobTitle,
      companySize: lead.companySize,
      industry: lead.industry,
      status: lead.status,
      sourceId: lead.sourceId,
      ownerId: lead.ownerId,
      convertedCustomerId: lead.convertedCustomerId,
      convertedBy: lead.convertedBy,
      convertedAt: lead.convertedAt,
      notes: lead.notes,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
    const customerFields: Record<string, unknown> = customer
      ? {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          companyName: customer.companyName,
          companyWebsite: customer.companyWebsite,
          jobTitle: customer.jobTitle,
          companySize: customer.companySize,
          industry: customer.industry,
          status: customer.status,
          createdBy: customer.createdBy,
          updatedBy: customer.updatedBy,
          notes: customer.notes,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        }
      : {};

    const separatorIndex = field.indexOf('.');
    if (separatorIndex >= 0) {
      const scope = field.slice(0, separatorIndex);
      const property = field.slice(separatorIndex + 1);
      const fields =
        scope === 'lead'
          ? leadFields
          : scope === 'customer'
            ? customerFields
            : null;
      return fields && Object.hasOwn(fields, property)
        ? fields[property]
        : null;
    }

    if (Object.hasOwn(leadFields, field) && leadFields[field] != null) {
      return leadFields[field];
    }
    return Object.hasOwn(customerFields, field) ? customerFields[field] : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  private assertLeadAccess(lead: Lead, actor: AuthenticatedUser): void {
    if (actor.role === UserRole.SALES && lead.ownerId !== actor.id) {
      throw new NotFoundException(`Lead with ID '${lead.id}' not found`);
    }
  }

  private assertEnrollmentAccess(
    enrollment: LeadFollowUpEnrollment,
    actor: AuthenticatedUser,
  ): void {
    if (
      actor.role === UserRole.SALES &&
      enrollment.lead?.ownerId !== actor.id
    ) {
      throw new NotFoundException(
        `Follow-up enrollment with ID '${enrollment.id}' not found`,
      );
    }
  }
}
