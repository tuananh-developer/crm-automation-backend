import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import {
  EnrollmentStatus,
  ExecutionStatus,
  FollowUpSequenceStatus,
} from './enums/follow-up.enum.js';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import { CRM_EVENTS } from '../../infrastructure/rabbitmq/rabbitmq.constants.js';
import {
  CancelEnrollmentDto,
  CreateSequenceDto,
  CreateStepDto,
  EnrollLeadDto,
  UpdateSequenceDto,
  UpdateStepDto,
} from './dto/index.js';

@Injectable()
export class SequencesService {
  private readonly logger = new Logger(SequencesService.name);

  constructor(
    @InjectRepository(FollowUpSequence)
    private readonly sequencesRepository: Repository<FollowUpSequence>,
    @InjectRepository(FollowUpStep)
    private readonly stepsRepository: Repository<FollowUpStep>,
    @InjectRepository(LeadFollowUpEnrollment)
    private readonly enrollmentsRepository: Repository<LeadFollowUpEnrollment>,
    @InjectRepository(FollowUpExecution)
    private readonly executionsRepository: Repository<FollowUpExecution>,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly rabbitmqService: RabbitMQService,
    @InjectRepository(Interaction)
    private readonly interactionsRepository: Repository<Interaction>,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  // ── Sequence Management ───────────────────────────────────────────────────

  async createSequence(dto: CreateSequenceDto): Promise<FollowUpSequence> {
    const existing = await this.sequencesRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Sequence with name '${dto.name}' already exists`,
      );
    }

    let createdBy = dto.createdBy;
    if (!createdBy) {
      // Find a default user (admin / first user)
      const [defaultUser] = await this.usersRepository.find({
        order: { createdAt: 'ASC' },
        take: 1,
      });
      if (defaultUser) {
        createdBy = defaultUser.id;
      }
    }

    if (!createdBy) {
      throw new BadRequestException('A valid user ID (createdBy) is required');
    }

    let status = dto.status ?? FollowUpSequenceStatus.ACTIVE;
    if (dto.isActive !== undefined && dto.status === undefined) {
      status = dto.isActive
        ? FollowUpSequenceStatus.ACTIVE
        : FollowUpSequenceStatus.PAUSED;
    }

    const sequence = this.sequencesRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      status,
      createdBy,
    });

    const saved = await this.sequencesRepository.save(sequence);
    this.logger.log(`Created FollowUpSequence ${saved.id} ("${saved.name}")`);
    return saved;
  }

  async findAllSequences(
    status?: FollowUpSequenceStatus,
  ): Promise<FollowUpSequence[]> {
    const where = status ? { status } : {};
    return this.sequencesRepository.find({
      where,
      order: { createdAt: 'DESC' },
      relations: {
        steps: true,
      },
    });
  }

  async findSequenceById(id: string): Promise<FollowUpSequence> {
    const sequence = await this.sequencesRepository.findOne({
      where: { id },
      relations: {
        steps: true,
      },
      order: {
        steps: {
          stepOrder: 'ASC',
        },
      },
    });

    if (!sequence) {
      throw new NotFoundException(
        `Follow-up sequence with ID '${id}' not found`,
      );
    }

    // Ensure steps are sorted by stepOrder ascending
    if (sequence.steps) {
      sequence.steps.sort((a, b) => a.stepOrder - b.stepOrder);
    }

    return sequence;
  }

  async updateSequence(
    id: string,
    dto: UpdateSequenceDto,
  ): Promise<FollowUpSequence> {
    const sequence = await this.findSequenceById(id);

    if (dto.name && dto.name !== sequence.name) {
      const existing = await this.sequencesRepository.findOne({
        where: { name: dto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Sequence with name '${dto.name}' already exists`,
        );
      }
      sequence.name = dto.name;
    }

    if (dto.description !== undefined) {
      sequence.description = dto.description ?? null;
    }
    if (dto.status !== undefined) {
      sequence.status = dto.status;
    } else if (dto.isActive !== undefined) {
      sequence.status = dto.isActive
        ? FollowUpSequenceStatus.ACTIVE
        : FollowUpSequenceStatus.PAUSED;
    }
    if (dto.updatedBy !== undefined) {
      sequence.updatedBy = dto.updatedBy ?? null;
    }

    const updated = await this.sequencesRepository.save(sequence);
    this.logger.log(
      `Updated FollowUpSequence ${updated.id} ("${updated.name}")`,
    );
    return updated;
  }

  // ── Step Management ───────────────────────────────────────────────────────

  async createStep(
    sequenceId: string,
    dto: CreateStepDto,
  ): Promise<FollowUpStep> {
    const sequence = await this.findSequenceById(sequenceId);

    const existingStep = await this.stepsRepository.findOne({
      where: { sequenceId: sequence.id, stepOrder: dto.stepOrder },
    });
    if (existingStep) {
      throw new ConflictException(
        `Step with order ${dto.stepOrder} already exists in sequence '${sequence.name}'`,
      );
    }

    const actionConfig = dto.actionConfig;
    const delayMinutes =
      dto.delayMinutes ??
      (typeof actionConfig?.delayDays === 'number'
        ? actionConfig.delayDays * 1440
        : typeof actionConfig?.delayMinutes === 'number'
          ? actionConfig.delayMinutes
          : 0);

    const channel =
      dto.channel ??
      (typeof actionConfig?.channel === 'string'
        ? actionConfig.channel
        : dto.actionType?.toUpperCase() === 'CALL'
          ? 'PHONE'
          : dto.actionType?.toUpperCase() === 'EMAIL'
            ? 'EMAIL'
            : 'SYSTEM');

    const metadata = dto.metadata ?? actionConfig ?? null;

    const step = this.stepsRepository.create({
      sequenceId: sequence.id,
      stepOrder: dto.stepOrder,
      delayMinutes,
      channel,
      actionType: dto.actionType,
      subjectTemplate: dto.subjectTemplate ?? null,
      contentTemplate: dto.contentTemplate ?? null,
      conditions: dto.conditions ?? null,
      metadata,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.stepsRepository.save(step);
    this.logger.log(
      `Created Step ${saved.id} (order=${saved.stepOrder}) for sequence ${sequence.id}`,
    );
    return saved;
  }

  async findStepsBySequence(sequenceId: string): Promise<FollowUpStep[]> {
    await this.findSequenceById(sequenceId); // validate existence
    return this.stepsRepository.find({
      where: { sequenceId },
      order: { stepOrder: 'ASC' },
    });
  }

  async updateStep(stepId: string, dto: UpdateStepDto): Promise<FollowUpStep> {
    const step = await this.stepsRepository.findOne({
      where: { id: stepId },
    });
    if (!step) {
      throw new NotFoundException(
        `Follow-up step with ID '${stepId}' not found`,
      );
    }

    if (dto.stepOrder !== undefined && dto.stepOrder !== step.stepOrder) {
      const duplicate = await this.stepsRepository.findOne({
        where: { sequenceId: step.sequenceId, stepOrder: dto.stepOrder },
      });
      if (duplicate && duplicate.id !== stepId) {
        throw new ConflictException(
          `Step order ${dto.stepOrder} is already in use in this sequence`,
        );
      }
      step.stepOrder = dto.stepOrder;
    }

    if (dto.delayMinutes !== undefined) step.delayMinutes = dto.delayMinutes;
    if (dto.channel !== undefined) step.channel = dto.channel;
    if (dto.actionType !== undefined) step.actionType = dto.actionType;
    if (dto.subjectTemplate !== undefined)
      step.subjectTemplate = dto.subjectTemplate ?? null;
    if (dto.contentTemplate !== undefined)
      step.contentTemplate = dto.contentTemplate ?? null;
    if (dto.conditions !== undefined) step.conditions = dto.conditions ?? null;
    if (dto.metadata !== undefined) step.metadata = dto.metadata ?? null;
    if (dto.actionConfig !== undefined) {
      step.metadata = {
        ...(step.metadata || {}),
        ...dto.actionConfig,
      };
      if (
        typeof dto.actionConfig.delayDays === 'number' &&
        dto.delayMinutes === undefined
      ) {
        step.delayMinutes = dto.actionConfig.delayDays * 1440;
      }
    }
    if (dto.isActive !== undefined) step.isActive = dto.isActive;

    return this.stepsRepository.save(step);
  }

  // ── Lead Follow-Up Enrollment (UC05) ──────────────────────────────────────

  /**
   * Enroll a lead into a follow-up sequence:
   *  1. Validate Lead exists in database (throw NotFoundException).
   *  2. Validate Sequence exists (throw NotFoundException) AND isActive === true (throw BadRequestException: "Sequence is not active").
   *  3. Prevent Duplicate Enrollment: Check if Lead is already enrolled in this sequence with status ACTIVE (throw ConflictException).
   *  4. Determine First Step:
   *     - Find active step with lowest stepOrder (order 1).
   *     - If sequence has no steps, throw BadRequestException: "Cannot enroll into sequence with no steps".
   *  5. Create Enrollment within DB Transaction:
   *     - LeadFollowUpEnrollment record with status ACTIVE.
   *     - First FollowUpExecution scheduled with delayMinutes.
   *     - Append Interaction record to log lead activity.
   *  6. Publish `lead.follow_up.triggered` event to RabbitMQ.
   */
  async enrollLead(dto: EnrollLeadDto): Promise<{
    message: string;
    enrollment: LeadFollowUpEnrollment;
    firstStep: FollowUpStep;
  }> {
    // 1. Validate Lead
    const lead = await this.leadsRepository.findOne({
      where: { id: dto.leadId },
    });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${dto.leadId}' not found`);
    }

    if (!dto.sequenceId) {
      throw new BadRequestException('A valid sequenceId is required');
    }

    // 2. Validate Sequence
    const sequence = await this.findSequenceById(dto.sequenceId);
    if (!sequence.isActive) {
      throw new BadRequestException('Sequence is not active');
    }

    // 3. Prevent duplicate active enrollment
    const existingActiveEnrollment = await this.enrollmentsRepository.findOne({
      where: {
        leadId: lead.id,
        sequenceId: sequence.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    if (existingActiveEnrollment) {
      throw new ConflictException(
        `Lead ${lead.id} is already actively enrolled in sequence '${sequence.name}'`,
      );
    }

    // 4. Find first active step (lowest stepOrder)
    const activeSteps = (sequence.steps || [])
      .filter((s) => s.isActive !== false)
      .sort((a, b) => a.stepOrder - b.stepOrder);

    if (activeSteps.length === 0) {
      throw new BadRequestException(
        'Cannot enroll into sequence with no steps',
      );
    }

    const firstStep = activeSteps[0];

    // 5. Transactional enrollment creation
    const executeEnrollment = async (repos: {
      enrollmentRepo: Repository<LeadFollowUpEnrollment>;
      executionRepo: Repository<FollowUpExecution>;
      interactionRepo: Repository<Interaction>;
    }) => {
      const enrollment = repos.enrollmentRepo.create({
        leadId: lead.id,
        sequenceId: sequence.id,
        currentStepId: firstStep.id,
        status: EnrollmentStatus.ACTIVE,
        startedAt: new Date(),
        assignedBy: dto.assignedBy ?? lead.ownerId ?? null,
      });
      const savedEnrollment = await repos.enrollmentRepo.save(enrollment);

      const scheduledDate = new Date(
        Date.now() + (firstStep.delayMinutes || 0) * 60 * 1000,
      );
      const execution = repos.executionRepo.create({
        enrollmentId: savedEnrollment.id,
        stepId: firstStep.id,
        status: ExecutionStatus.PENDING,
        scheduledAt: scheduledDate,
        requestPayload: {
          recipientEmail: lead.email,
          recipientName: `${lead.firstName} ${lead.lastName || ''}`.trim(),
          channel: firstStep.channel,
          actionType: firstStep.actionType,
          subject: firstStep.subjectTemplate,
        },
        retryCount: 0,
      });
      await repos.executionRepo.save(execution);

      // Log activity / interaction
      const interaction = repos.interactionRepo.create({
        leadId: lead.id,
        type: 'NOTE',
        channel: 'SYSTEM',
        subject: 'Follow-up Sequence Enrollment',
        content: `Enrolled in follow-up sequence: ${sequence.name} (Step ${firstStep.stepOrder}: ${firstStep.actionType})`,
        occurredAt: new Date(),
        createdBy: dto.assignedBy ?? lead.ownerId ?? null,
      });
      await repos.interactionRepo.save(interaction);

      return { savedEnrollment, scheduledDate };
    };

    let savedEnrollment: LeadFollowUpEnrollment;
    let scheduledDate: Date;

    if (this.dataSource) {
      const txResult = await this.dataSource.transaction(async (manager) => {
        return executeEnrollment({
          enrollmentRepo: manager.getRepository(LeadFollowUpEnrollment),
          executionRepo: manager.getRepository(FollowUpExecution),
          interactionRepo: manager.getRepository(Interaction),
        });
      });
      savedEnrollment = txResult.savedEnrollment;
      scheduledDate = txResult.scheduledDate;
    } else {
      const result = await executeEnrollment({
        enrollmentRepo: this.enrollmentsRepository,
        executionRepo: this.executionsRepository,
        interactionRepo: this.interactionsRepository,
      });
      savedEnrollment = result.savedEnrollment;
      scheduledDate = result.scheduledDate;
    }

    this.logger.log(
      `Enrolled lead ${lead.id} into sequence ${sequence.id} (Enrollment ID: ${savedEnrollment.id}, firstStep: ${firstStep.id})`,
    );

    // 6. Publish event to RabbitMQ
    await this.rabbitmqService.publishEvent(CRM_EVENTS.FOLLOW_UP_TRIGGERED, {
      enrollmentId: savedEnrollment.id,
      leadId: lead.id,
      sequenceId: sequence.id,
      stepId: firstStep.id,
      scheduledAt: scheduledDate.toISOString(),
    });

    return {
      message: 'Lead successfully enrolled into follow-up sequence',
      enrollment: savedEnrollment,
      firstStep,
    };
  }

  async findAllEnrollments(query?: {
    leadId?: string;
    sequenceId?: string;
    status?: EnrollmentStatus;
  }): Promise<LeadFollowUpEnrollment[]> {
    const where: FindOptionsWhere<LeadFollowUpEnrollment> = {};
    if (query?.leadId) where.leadId = query.leadId;
    if (query?.sequenceId) where.sequenceId = query.sequenceId;
    if (query?.status) where.status = query.status;

    return this.enrollmentsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      relations: {
        lead: true,
        sequence: true,
        currentStep: true,
      },
    });
  }

  async findEnrollmentById(id: string): Promise<LeadFollowUpEnrollment> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id },
      relations: {
        lead: true,
        sequence: {
          steps: true,
        },
        currentStep: true,
        executions: {
          step: true,
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Lead follow-up enrollment with ID '${id}' not found`,
      );
    }

    return enrollment;
  }

  async findEnrollmentsByLead(
    leadId: string,
  ): Promise<LeadFollowUpEnrollment[]> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID '${leadId}' not found`);
    }

    return this.enrollmentsRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      relations: {
        sequence: true,
        currentStep: true,
        executions: true,
      },
    });
  }

  async cancelEnrollment(
    id: string,
    dto?: CancelEnrollmentDto,
  ): Promise<LeadFollowUpEnrollment> {
    const enrollment = await this.findEnrollmentById(id);

    if (enrollment.status === EnrollmentStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot cancel an enrollment that is already COMPLETED',
      );
    }

    enrollment.status = EnrollmentStatus.CANCELLED;
    enrollment.cancelledAt = new Date();
    enrollment.cancellationReason =
      dto?.cancellationReason ?? 'Cancelled by user';

    // Mark any PENDING executions as SKIPPED
    if (enrollment.executions) {
      for (const exec of enrollment.executions) {
        if (exec.status === ExecutionStatus.PENDING) {
          exec.status = ExecutionStatus.SKIPPED;
          await this.executionsRepository.save(exec);
        }
      }
    }

    const saved = await this.enrollmentsRepository.save(enrollment);
    this.logger.log(`Cancelled LeadFollowUpEnrollment ${saved.id}`);
    return saved;
  }

  async pauseEnrollment(id: string): Promise<LeadFollowUpEnrollment> {
    const enrollment = await this.findEnrollmentById(id);

    if (
      enrollment.status === EnrollmentStatus.COMPLETED ||
      enrollment.status === EnrollmentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot pause an enrollment that is already ${enrollment.status}`,
      );
    }

    enrollment.status = EnrollmentStatus.PAUSED;
    enrollment.pausedAt = new Date();
    const saved = await this.enrollmentsRepository.save(enrollment);
    this.logger.log(`Paused LeadFollowUpEnrollment ${saved.id}`);
    return saved;
  }

  async resumeEnrollment(id: string): Promise<LeadFollowUpEnrollment> {
    const enrollment = await this.findEnrollmentById(id);

    if (enrollment.status !== EnrollmentStatus.PAUSED) {
      throw new BadRequestException('Only PAUSED enrollments can be resumed');
    }

    enrollment.status = EnrollmentStatus.ACTIVE;
    enrollment.pausedAt = null;
    const saved = await this.enrollmentsRepository.save(enrollment);
    this.logger.log(`Resumed LeadFollowUpEnrollment ${saved.id}`);
    return saved;
  }

  async updateEnrollmentStatus(
    id: string,
    status: EnrollmentStatus,
    reason?: string,
  ): Promise<LeadFollowUpEnrollment> {
    if (status === EnrollmentStatus.CANCELLED) {
      return this.cancelEnrollment(id, { cancellationReason: reason });
    }
    if (status === EnrollmentStatus.PAUSED) {
      return this.pauseEnrollment(id);
    }
    if (status === EnrollmentStatus.ACTIVE) {
      return this.resumeEnrollment(id);
    }
    const enrollment = await this.findEnrollmentById(id);
    enrollment.status = status;
    return this.enrollmentsRepository.save(enrollment);
  }
}
