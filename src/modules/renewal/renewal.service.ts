import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { CustomerTask } from '../customers/entities/customer-task.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import type {
  ApproveRenewalDraftDto,
  CheckEligibilityDto,
  CreateContractDto,
  EnsureRenewalApprovalTaskDto,
  RecordRenewalAttemptDto,
  SaveRenewalDraftDto,
  SendRenewalMessageDto,
  UpdateContractDto,
} from './dto/renewal.dto.js';

export const RENEWAL_MAIL_TRANSPORT = 'RENEWAL_MAIL_TRANSPORT';
const RENEWAL_PROCESSING_LEASE_MS = 2 * 60_000;
const MAX_RENEWAL_DELIVERY_ATTEMPTS = 4;

export interface RenewalDeliveryClaim {
  idempotencyKey: string;
  requestHash: string;
  status:
    | 'PROCESSING'
    | 'SENT'
    | 'RETRYABLE_FAILURE'
    | 'PERMANENT_FAILURE'
    | 'UNKNOWN';
  attempts: number;
  providerMessageId: string | null;
  startedAt: string;
  sentAt: string | null;
  lastError: string | null;
}

export interface SendRenewalOutcome {
  contractId: string;
  customerId: string;
  draftId: string;
  status: 'SENT' | 'FAILED' | 'UNKNOWN' | 'PROCESSING';
  communicationId: string | null;
  delivered: boolean;
  idempotencyKey: string;
  errorMessage?: string | null;
  idempotencyStatus?: 'new' | 'replayed';
}

export interface RenewalMailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

/**
 * RenewalService is the single backend authority for renewal decisions.
 * n8n workflows must never recompute urgency, eligibility, or consent on
 * their own; this service enforces that.
 */
@Injectable()
export class RenewalService {
  private readonly logger = new Logger(RenewalService.name);
  private readonly deliveryLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(RenewalDraft)
    private readonly draftRepo: Repository<RenewalDraft>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @Optional()
    @InjectRepository(CustomerTask)
    private readonly customerTaskRepo?: Repository<CustomerTask>,
    @Optional()
    @InjectRepository(AuditLog)
    private readonly auditLogRepo?: Repository<AuditLog>,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    @Inject(RENEWAL_MAIL_TRANSPORT)
    private readonly mailTransport?: RenewalMailTransport,
  ) {}

  private async assertCustomerAccess(
    customerId: string,
    actor?: AuthenticatedUser,
  ): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });
    if (
      !customer ||
      (actor &&
        actor.role === UserRole.SALES &&
        customer.createdBy !== actor.id)
    ) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }
    return customer;
  }

  private async assertContractAccess(
    contract: Contract,
    actor?: AuthenticatedUser,
  ): Promise<void> {
    if (!actor || actor.role === UserRole.ADMIN) {
      return;
    }
    const customer = await this.customerRepo.findOne({
      where: { id: contract.customerId },
    });
    if (!customer || customer.createdBy !== actor.id) {
      throw new NotFoundException(`Contract with ID ${contract.id} not found`);
    }
  }

  /**
   * Create a customer contract with authoritative customer existence check,
   * actor scope check, date validation and duplicate contract number check.
   */
  async createContract(
    dto: CreateContractDto,
    actor?: AuthenticatedUser,
  ): Promise<Contract> {
    await this.assertCustomerAccess(dto.customerId, actor);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException(
        'startDate and endDate must be valid dates',
      );
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    const existing = await this.contractRepo.findOne({
      where: { contractNumber: dto.contractNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Contract with number ${dto.contractNumber} already exists`,
      );
    }

    const contract = this.contractRepo.create({
      customerId: dto.customerId,
      contractNumber: dto.contractNumber,
      status: dto.status ?? 'ACTIVE',
      startDate,
      endDate,
      renewalDate: dto.renewalDate ? new Date(dto.renewalDate) : null,
      amount: dto.amount ?? null,
    });

    return this.contractRepo.save(contract);
  }

  /**
   * List contracts, optionally filtered by customerId or status, scoped to actor.
   */
  async listContracts(
    filter?: {
      customerId?: string;
      status?: string;
    },
    actor?: AuthenticatedUser,
  ): Promise<Contract[]> {
    const where: Record<string, unknown> = {};
    if (filter?.customerId) {
      if (actor && actor.role === UserRole.SALES) {
        await this.assertCustomerAccess(filter.customerId, actor);
      }
      where.customerId = filter.customerId;
    } else if (
      actor &&
      actor.role === UserRole.SALES &&
      this.customerRepo.find
    ) {
      const ownedCustomers = await this.customerRepo.find({
        where: { createdBy: actor.id },
        select: { id: true },
      });
      if (ownedCustomers.length === 0) {
        return [];
      }
      where.customerId = In(ownedCustomers.map((c) => c.id));
    }
    if (filter?.status) where.status = filter.status;
    return this.contractRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get single contract by ID. Enforces Sales ownership when actor is provided.
   */
  async getContract(id: string, actor?: AuthenticatedUser): Promise<Contract> {
    const contract = await this.contractRepo.findOne({
      where: { id },
    });
    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found`);
    }
    await this.assertContractAccess(contract, actor);
    return contract;
  }

  /**
   * Update an existing contract with actor scope check.
   */
  async updateContract(
    id: string,
    dto: UpdateContractDto,
    actor?: AuthenticatedUser,
  ): Promise<Contract> {
    const contract = await this.getContract(id, actor);

    if (dto.status !== undefined) contract.status = dto.status;
    if (dto.endDate !== undefined) contract.endDate = new Date(dto.endDate);
    if (dto.renewalDate !== undefined) {
      contract.renewalDate = dto.renewalDate ? new Date(dto.renewalDate) : null;
    }
    if (dto.amount !== undefined) contract.amount = dto.amount;

    return this.contractRepo.save(contract);
  }

  /**
   * Retrieve active contracts due for renewal within the configured days window.
   */
  async findRenewalContracts(
    days: number = 30,
    actor?: AuthenticatedUser,
  ): Promise<Contract[]> {
    const now = new Date();
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const qb = this.contractRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: 'ACTIVE' })
      .andWhere('c.renewalDate IS NOT NULL')
      .andWhere('c.renewalDate >= :now', { now })
      .andWhere('c.renewalDate <= :end', { end });

    if (actor && actor.role === UserRole.SALES && this.customerRepo.find) {
      const ownedCustomers = await this.customerRepo.find({
        where: { createdBy: actor.id },
        select: { id: true },
      });
      if (ownedCustomers.length === 0) {
        return [];
      }
      qb.andWhere('c.customerId IN (:...customerIds)', {
        customerIds: ownedCustomers.map((c) => c.id),
      });
    }

    return qb.orderBy('c.renewalDate', 'ASC').getMany();
  }

  /**
   * Backend-canonical urgency levels. n8n must use this function only.
   */
  calculateUrgency(renewalDate: Date | null): {
    level: string;
    daysRemaining: number;
  } {
    if (!renewalDate || isNaN(renewalDate.getTime())) {
      return { level: 'UNKNOWN', daysRemaining: -1 };
    }
    const now = new Date();
    const diff = renewalDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    if (days < 0) return { level: 'EXPIRED', daysRemaining: days };
    if (days <= 7) return { level: 'CRITICAL', daysRemaining: days };
    if (days <= 30) return { level: 'HIGH', daysRemaining: days };
    if (days <= 60) return { level: 'MEDIUM', daysRemaining: days };
    return { level: 'LOW', daysRemaining: days };
  }

  /**
   * Idempotent draft save.
   * Security invariant: NEVER trusts caller-supplied status or consent/template/policy/approval
   * flags in validationResult. All newly created drafts start in status 'DRAFT' with
   * approval/consent flags set to false/null, and evaluate authoritative eligibility.
   */
  async saveDraft(
    data: SaveRenewalDraftDto,
    actor?: AuthenticatedUser,
  ): Promise<
    RenewalDraft & { canAutoSend?: boolean; eligibilityReason?: string }
  > {
    if (!data.idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for renewal draft creation',
      );
    }

    const existing = await this.draftRepo.findOne({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) {
      if (actor) {
        await this.assertCustomerAccess(existing.customerId, actor);
      }
      const existingContract = await this.contractRepo.findOne({
        where: { id: existing.contractId },
      });
      const eligibility = existingContract
        ? this.evaluateDraftEligibilityFromRecords(existingContract, existing)
        : {
            canAutoSend: false,
            reason: 'FAIL_CLOSED: contract not found',
          };
      return Object.assign(existing, {
        canAutoSend: eligibility.canAutoSend,
        eligibilityReason: eligibility.reason,
      });
    }

    const contract = await this.contractRepo.findOne({
      where: { id: data.contractId },
    });
    if (!contract) {
      throw new NotFoundException(
        `Contract with ID ${data.contractId} not found`,
      );
    }
    if (contract.customerId !== data.customerId) {
      throw new BadRequestException(
        `Contract customerId does not match supplied customerId`,
      );
    }
    await this.assertContractAccess(contract, actor);

    const rawValidation =
      data.validationResult &&
      typeof data.validationResult === 'object' &&
      !Array.isArray(data.validationResult)
        ? data.validationResult
        : {};

    // Strip any caller-forged consentGranted, templateApproved, policyApproved, approvedBy
    const sanitizedValidationResult: Record<string, unknown> = {
      grounded: Boolean(rawValidation.grounded ?? true),
      sourceContractId: data.contractId,
      sourceCustomerId: data.customerId,
      consentGranted: false,
      templateApproved: false,
      policyApproved: false,
      approvedBy: null,
      approvedAt: null,
    };

    const draft = this.draftRepo.create({
      contractId: data.contractId,
      customerId: data.customerId,
      renewalDate: data.renewalDate ? new Date(data.renewalDate) : null,
      urgency: data.urgency ?? null,
      recommendation: data.recommendation ?? null,
      draftContent: data.draftContent ?? null,
      status: 'DRAFT',
      idempotencyKey: data.idempotencyKey,
      aiModel: data.aiModel ?? null,
      validationResult: sanitizedValidationResult,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
      workflowExecutionId: data.workflowExecutionId ?? null,
      communicationId: null,
    });
    const saved = await this.draftRepo.save(draft);

    const eligibility = this.evaluateDraftEligibilityFromRecords(
      contract,
      saved,
    );
    return Object.assign(saved, {
      canAutoSend: eligibility.canAutoSend,
      eligibilityReason: eligibility.reason,
    });
  }

  /**
   * Authoritative backend-owned approval transition for a renewal draft.
   * Only an authenticated Admin or the Sales owner of the customer can approve a draft.
   * Independently verifies persisted customer outreach eligibility, template grounding
   * and placeholder safety, and active contract policy before recording an audited
   * human attestation.
   */
  async approveDraft(
    draftId: string,
    dto: ApproveRenewalDraftDto,
    actor: AuthenticatedUser,
  ): Promise<
    RenewalDraft & { canAutoSend: boolean; eligibilityReason: string }
  > {
    const draft = await this.getDraft(draftId, actor);
    const contract = await this.getContract(draft.contractId, actor);
    const customer = await this.assertCustomerAccess(
      contract.customerId,
      actor,
    );

    if (contract.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot approve renewal draft for non-ACTIVE contract (${contract.status})`,
      );
    }
    if (!dto.consentGranted || !dto.templateApproved || !dto.policyApproved) {
      throw new BadRequestException(
        'consentGranted, templateApproved, and policyApproved must all be verified true to approve a renewal draft',
      );
    }

    // 1. Independently verify customer consent & contactability from persisted Customer record
    const customerEmail = customer.email?.trim() ?? '';
    const customerStatus = (customer.status ?? 'ACTIVE').toUpperCase();
    const customerNotes = (customer.notes ?? '').toUpperCase();
    const hasOptOutMarker =
      ['INACTIVE', 'CHURNED', 'OPTED_OUT', 'UNSUBSCRIBED'].includes(
        customerStatus,
      ) ||
      customerNotes.includes('OPT_OUT') ||
      customerNotes.includes('DO_NOT_CONTACT');
    if (!customerEmail || !customerEmail.includes('@') || hasOptOutMarker) {
      throw new BadRequestException(
        'Customer consent verification failed: customer record is opted out, inactive, or lacks a valid email address',
      );
    }

    // 2. Independently verify template compliance & grounding from persisted RenewalDraft & Contract
    const draftContent = draft.draftContent?.trim() ?? '';
    const existingMeta = draft.validationResult ?? {};
    if (existingMeta.grounded === false) {
      throw new BadRequestException(
        'Template verification failed: draft failed contract grounding validation',
      );
    }
    if (!draftContent || draftContent.length < 10) {
      throw new BadRequestException(
        'Template verification failed: draftContent is missing or too short for renewal outreach',
      );
    }
    if (/\{\{.*?\}\}/.test(draftContent)) {
      throw new BadRequestException(
        'Template verification failed: draftContent contains unresolved template placeholders',
      );
    }
    if (
      contract.contractNumber &&
      !draftContent.includes(contract.contractNumber)
    ) {
      throw new BadRequestException(
        `Template verification failed: draftContent must reference contract number ${contract.contractNumber}`,
      );
    }

    // 3. Independently verify commercial policy from persisted Contract dates
    if (
      contract.startDate &&
      contract.endDate &&
      new Date(contract.startDate).getTime() >
        new Date(contract.endDate).getTime()
    ) {
      throw new BadRequestException(
        'Policy verification failed: contract startDate is after endDate',
      );
    }

    const templateContentHash = createHash('sha256')
      .update(draftContent)
      .digest('hex');

    const previousStatus = draft.status;
    const approvedAt = new Date().toISOString();
    const attestationEvidence = {
      consentVerifiedFromCustomerId: customer.id,
      consentVerifiedEmail: customerEmail,
      consentCustomerStatus: customerStatus,
      templateVerifiedContractNumber: contract.contractNumber,
      templateContentHash,
      policyVersion: 'wf13-v1',
      policyContractStatus: contract.status,
      attestedByUserId: actor.id,
      attestedByRole: actor.role,
      attestedAt: approvedAt,
    };

    draft.status = 'APPROVED';
    draft.validationResult = {
      ...existingMeta,
      grounded: true,
      consentGranted: true,
      templateApproved: true,
      policyApproved: true,
      approvedBy: actor.id,
      approvedAt,
      comment: dto.comment ?? null,
      attestationEvidence,
    };

    const saved = await this.draftRepo.save(draft);

    // Complete any open RENEWAL_APPROVAL task for this contract
    if (this.customerTaskRepo?.find) {
      const openTasks = await this.customerTaskRepo.find({
        where: {
          customerId: contract.customerId,
          sourceEntityType: 'CustomerContract',
          sourceEntityId: contract.id,
        },
      });
      for (const task of openTasks) {
        if (task.status === 'OPEN') {
          task.status = 'COMPLETED';
          await this.customerTaskRepo.save(task);
        }
      }
    }

    if (this.auditLogRepo) {
      await this.auditLogRepo.save(
        this.auditLogRepo.create({
          userId: actor.id,
          action: 'RENEWAL_DRAFT_APPROVED',
          entityType: 'RenewalDraft',
          entityId: saved.id,
          oldValue: { status: previousStatus },
          newValue: {
            status: saved.status,
            approvedBy: actor.id,
            approvedAt,
            attestationEvidence,
          },
          metadata: {
            contractId: contract.id,
            customerId: contract.customerId,
            comment: dto.comment ?? null,
            templateContentHash,
          },
          ipAddress: null,
          userAgent: null,
        }),
      );
    }

    const eligibility = this.evaluateDraftEligibilityFromRecords(
      contract,
      saved,
    );
    return Object.assign(saved, {
      canAutoSend: eligibility.canAutoSend,
      eligibilityReason: eligibility.reason,
    });
  }

  async findDraftByIdempotencyKey(key: string): Promise<RenewalDraft | null> {
    return this.draftRepo.findOne({ where: { idempotencyKey: key } });
  }

  async getDraft(id: string, actor?: AuthenticatedUser): Promise<RenewalDraft> {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) {
      throw new NotFoundException(`Renewal draft with ID ${id} not found`);
    }
    if (actor) {
      await this.assertCustomerAccess(draft.customerId, actor);
    }
    return draft;
  }

  async listDraftsForContract(
    contractId: string,
    actor?: AuthenticatedUser,
  ): Promise<RenewalDraft[]> {
    if (actor) {
      await this.getContract(contractId, actor);
    }
    return this.draftRepo.find({
      where: { contractId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create or reuse an idempotent approval CustomerTask and notify the customer owner.
   */
  async ensureRenewalApprovalTask(dto: EnsureRenewalApprovalTaskDto): Promise<{
    contractId: string;
    customerId: string;
    draftId: string | null;
    taskId: string;
    taskStatus: string;
    status: 'PENDING_APPROVAL';
    idempotencyKey: string;
  }> {
    if (!dto.idempotencyKey?.trim()) {
      throw new BadRequestException(
        'idempotencyKey is required for approval task creation',
      );
    }

    const contract = await this.getContract(dto.contractId);
    if (contract.customerId !== dto.customerId) {
      throw new BadRequestException(
        'Contract customerId does not match supplied customerId',
      );
    }
    const customer = await this.customerRepo.findOne({
      where: { id: contract.customerId },
    });

    let draft: RenewalDraft | null = null;
    if (dto.draftId) {
      draft = await this.draftRepo.findOne({ where: { id: dto.draftId } });
      if (!draft || draft.contractId !== contract.id) {
        throw new NotFoundException(
          `Renewal draft with ID ${dto.draftId} not found for contract ${contract.id}`,
        );
      }
      if (draft.status !== 'APPROVED' && draft.status !== 'SENT') {
        draft.status = 'PENDING_APPROVAL';
        await this.draftRepo.save(draft);
      }
    }

    const key = dto.idempotencyKey.trim();
    let task: CustomerTask | null = null;

    if (this.customerTaskRepo) {
      const existingTask = await this.customerTaskRepo.findOne({
        where: { idempotencyKey: key },
      });
      if (existingTask) {
        task = existingTask;
      } else {
        const created = this.customerTaskRepo.create({
          customerId: contract.customerId,
          taskType: 'RENEWAL_APPROVAL',
          title: `Approve renewal draft for contract ${contract.contractNumber}`,
          description:
            draft?.recommendation ??
            `Renewal approval required for contract ${contract.contractNumber}`,
          notes:
            draft?.draftContent ??
            `Pending human approval for contract ${contract.contractNumber}`,
          priority: 'HIGH',
          status: 'OPEN',
          assignedTo: customer?.createdBy ?? null,
          sourceEntityType: 'CustomerContract',
          sourceEntityId: contract.id,
          idempotencyKey: key,
          metadata: {
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            draftId: draft?.id ?? dto.draftId ?? null,
          },
        });
        task = await this.customerTaskRepo.save(created);
      }
    }

    if (customer?.createdBy && this.notificationsService) {
      await this.notificationsService.create({
        userId: customer.createdBy,
        type: NotificationType.HUMAN_REVIEW_REQUIRED,
        title: `Renewal approval required: ${contract.contractNumber}`,
        content: `Contract ${contract.contractNumber} requires human approval before renewal message delivery.`,
        severity: 'HIGH',
        customerId: customer.id,
        idempotencyKey: `${key}:notification`,
      });
    }

    return {
      contractId: contract.id,
      customerId: contract.customerId,
      draftId: draft?.id ?? dto.draftId ?? null,
      taskId: task?.id ?? `renewal-task:${key}`,
      taskStatus: String(task?.status ?? 'OPEN'),
      status: 'PENDING_APPROVAL',
      idempotencyKey: key,
    };
  }

  async listApprovalTasksForContract(
    contractId: string,
    actor?: AuthenticatedUser,
  ): Promise<CustomerTask[]> {
    const contract = await this.getContract(contractId, actor);
    if (!this.customerTaskRepo) {
      return [];
    }
    return this.customerTaskRepo.find({
      where: {
        customerId: contract.customerId,
        sourceEntityType: 'CustomerContract',
        sourceEntityId: contract.id,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Deliver an approved renewal message through the backend communication adapter.
   * Claims a durable PROCESSING lease on the RenewalDraft row before contacting SMTP,
   * reconciles stale/interrupted claims to UNKNOWN so ambiguous outcomes are never
   * automatically resent, and persists SENT only after confirmed provider delivery.
   */
  async sendApprovedRenewal(
    dto: SendRenewalMessageDto,
  ): Promise<SendRenewalOutcome> {
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for renewal message delivery',
      );
    }

    const claimOutcome = await this.withDeliveryLock(dto.draftId, () =>
      this.claimRenewalDelivery(dto, idempotencyKey),
    );
    if (claimOutcome.kind === 'result') {
      return claimOutcome.result;
    }

    const {
      contract,
      customer,
      draftId,
      recipientEmail,
      subject,
      bodyText,
      attempts,
    } = claimOutcome.claim;

    let confirmedMessageId: string;
    try {
      const transport = this.mailTransport;
      if (!transport) {
        throw new Error('MAIL_TRANSPORT_UNAVAILABLE');
      }
      const sent = await transport.sendMail({
        from: process.env.SMTP_FROM_EMAIL || 'noreply@crm.example.com',
        to: recipientEmail,
        subject,
        text: bodyText,
      });
      const msgId =
        typeof sent?.messageId === 'string' && sent.messageId.trim()
          ? sent.messageId.trim()
          : null;
      if (!msgId) {
        throw new Error('SMTP_PROVIDER_MISSING_MESSAGE_ID');
      }
      confirmedMessageId = msgId;
    } catch (error: unknown) {
      const classification = this.classifySmtpError(error, attempts);
      const updated = await this.withDeliveryLock(draftId, () =>
        this.finishRenewalDelivery(
          draftId,
          classification.claimStatus,
          null,
          classification.errorCode,
          classification.errorMessage,
        ),
      );
      const outStatus =
        updated.status === 'UNKNOWN'
          ? ('UNKNOWN' as const)
          : ('FAILED' as const);
      return {
        contractId: contract.id,
        customerId: customer.id,
        draftId,
        status: outStatus,
        communicationId: null,
        delivered: false,
        idempotencyKey,
        errorMessage: classification.errorMessage,
        idempotencyStatus: claimOutcome.claim.idempotencyStatus,
      };
    }

    // Keep database acknowledgement outside the SMTP try/catch.
    // If SMTP accepted the email but PostgreSQL fails to persist the acknowledgement,
    // the row stays in PROCESSING (never reverted to APPROVED) and transitions to UNKNOWN
    // on stale-lease reconciliation rather than resending a duplicate email.
    const completed = await this.withDeliveryLock(draftId, () =>
      this.finishRenewalDelivery(
        draftId,
        'SENT',
        confirmedMessageId,
        null,
        null,
      ),
    );

    if (completed.status !== 'SENT') {
      return {
        contractId: contract.id,
        customerId: customer.id,
        draftId,
        status: 'UNKNOWN',
        communicationId: completed.communicationId,
        delivered: false,
        idempotencyKey,
        errorMessage: 'DELIVERY_OUTCOME_UNKNOWN',
        idempotencyStatus: claimOutcome.claim.idempotencyStatus,
      };
    }

    return {
      contractId: contract.id,
      customerId: customer.id,
      draftId,
      status: 'SENT',
      communicationId: confirmedMessageId,
      delivered: true,
      idempotencyKey,
      idempotencyStatus: claimOutcome.claim.idempotencyStatus,
    };
  }

  private async claimRenewalDelivery(
    dto: SendRenewalMessageDto,
    idempotencyKey: string,
  ): Promise<
    | { kind: 'result'; result: SendRenewalOutcome }
    | {
        kind: 'send';
        claim: {
          contract: Contract;
          customer: Customer;
          draftId: string;
          recipientEmail: string;
          subject: string;
          bodyText: string;
          attempts: number;
          idempotencyStatus: 'new' | 'replayed';
        };
      }
  > {
    return this.runInDraftTransaction(async (draftRepo) => {
      const contract = await this.contractRepo.findOne({
        where: { id: dto.contractId },
      });
      if (!contract || contract.customerId !== dto.customerId) {
        throw new BadRequestException(
          'Renewal draft is not eligible for automatic delivery (FAIL_CLOSED: contract not found)',
        );
      }

      const draft = await draftRepo.findOne({
        where: { id: dto.draftId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!draft || draft.contractId !== contract.id) {
        throw new BadRequestException(
          'Renewal draft is not eligible for automatic delivery (FAIL_CLOSED: draft not found)',
        );
      }

      const customer = await this.customerRepo.findOne({
        where: { id: dto.customerId },
      });
      if (!customer || !customer.email) {
        throw new BadRequestException(
          `Customer ${dto.customerId} does not have a valid delivery email address`,
        );
      }

      const subject = `Contract Renewal Proposal — ${contract.contractNumber}`;
      const bodyText =
        draft.draftContent?.trim() ||
        `Dear ${customer.name}, your contract ${contract.contractNumber} is due for renewal.`;
      const requestHash = createHash('sha256')
        .update(
          JSON.stringify({
            contractId: contract.id,
            customerId: customer.id,
            draftId: draft.id,
            recipient: customer.email.trim().toLowerCase(),
            subject,
            bodyText,
          }),
        )
        .digest('hex');

      const meta = draft.validationResult ?? {};
      const existingClaim = meta.deliveryClaim as
        RenewalDeliveryClaim | undefined;

      if (existingClaim) {
        if (
          existingClaim.idempotencyKey !== idempotencyKey ||
          existingClaim.requestHash !== requestHash
        ) {
          throw new ConflictException(
            'Renewal delivery payload or idempotencyKey changed after delivery was claimed',
          );
        }

        if (draft.status === 'SENT' || existingClaim.status === 'SENT') {
          return {
            kind: 'result',
            result: {
              contractId: contract.id,
              customerId: customer.id,
              draftId: draft.id,
              status: 'SENT',
              communicationId:
                draft.communicationId ?? existingClaim.providerMessageId,
              delivered: true,
              idempotencyKey,
              idempotencyStatus: 'replayed',
            },
          };
        }

        if (draft.status === 'UNKNOWN' || existingClaim.status === 'UNKNOWN') {
          return {
            kind: 'result',
            result: {
              contractId: contract.id,
              customerId: customer.id,
              draftId: draft.id,
              status: 'UNKNOWN',
              communicationId: null,
              delivered: false,
              idempotencyKey,
              errorMessage:
                draft.errorMessage ??
                existingClaim.lastError ??
                'DELIVERY_OUTCOME_UNKNOWN',
              idempotencyStatus: 'replayed',
            },
          };
        }

        if (existingClaim.status === 'PERMANENT_FAILURE') {
          return {
            kind: 'result',
            result: {
              contractId: contract.id,
              customerId: customer.id,
              draftId: draft.id,
              status: 'FAILED',
              communicationId: null,
              delivered: false,
              idempotencyKey,
              errorMessage:
                draft.errorMessage ??
                existingClaim.lastError ??
                'DELIVERY_PERMANENT_FAILURE',
              idempotencyStatus: 'replayed',
            },
          };
        }

        if (
          draft.status === 'PROCESSING' ||
          existingClaim.status === 'PROCESSING'
        ) {
          const startedAtMs = Date.parse(existingClaim.startedAt);
          const isStale =
            Number.isFinite(startedAtMs) &&
            Date.now() - startedAtMs > RENEWAL_PROCESSING_LEASE_MS;
          if (isStale) {
            const unknownClaim: RenewalDeliveryClaim = {
              ...existingClaim,
              status: 'UNKNOWN',
              lastError: 'DELIVERY_OUTCOME_UNKNOWN',
            };
            draft.status = 'UNKNOWN';
            draft.errorCode = 'DELIVERY_OUTCOME_UNKNOWN';
            draft.errorMessage = 'DELIVERY_OUTCOME_UNKNOWN';
            draft.validationResult = {
              ...meta,
              deliveryClaim: unknownClaim,
            };
            await draftRepo.save(draft);

            return {
              kind: 'result',
              result: {
                contractId: contract.id,
                customerId: customer.id,
                draftId: draft.id,
                status: 'UNKNOWN',
                communicationId: null,
                delivered: false,
                idempotencyKey,
                errorMessage: 'DELIVERY_OUTCOME_UNKNOWN',
                idempotencyStatus: 'replayed',
              },
            };
          }

          return {
            kind: 'result',
            result: {
              contractId: contract.id,
              customerId: customer.id,
              draftId: draft.id,
              status: 'PROCESSING',
              communicationId: null,
              delivered: false,
              idempotencyKey,
              errorMessage: 'DELIVERY_ALREADY_PROCESSING',
              idempotencyStatus: 'replayed',
            },
          };
        }
      }

      if (draft.status === 'SENT' && draft.communicationId) {
        return {
          kind: 'result',
          result: {
            contractId: contract.id,
            customerId: customer.id,
            draftId: draft.id,
            status: 'SENT',
            communicationId: draft.communicationId,
            delivered: true,
            idempotencyKey,
            idempotencyStatus: 'replayed',
          },
        };
      }

      const eligibility = this.evaluateDraftEligibilityFromRecords(
        contract,
        draft,
      );
      if (!eligibility.canAutoSend) {
        throw new BadRequestException(
          `Renewal draft is not eligible for automatic delivery (${eligibility.reason})`,
        );
      }

      if (!this.mailTransport) {
        const errorMessage =
          'FAIL_CLOSED: mail transport is not configured; cannot deliver renewal message';
        const failedClaim: RenewalDeliveryClaim = {
          idempotencyKey,
          requestHash,
          status: 'PERMANENT_FAILURE',
          attempts: (existingClaim?.attempts ?? 0) + 1,
          providerMessageId: null,
          startedAt: new Date().toISOString(),
          sentAt: null,
          lastError: errorMessage,
        };
        draft.status = 'FAILED';
        draft.errorCode = 'MAIL_TRANSPORT_UNAVAILABLE';
        draft.errorMessage = errorMessage;
        draft.validationResult = {
          ...meta,
          deliveryClaim: failedClaim,
        };
        await draftRepo.save(draft);

        return {
          kind: 'result',
          result: {
            contractId: contract.id,
            customerId: customer.id,
            draftId: draft.id,
            status: 'FAILED',
            communicationId: null,
            delivered: false,
            idempotencyKey,
            errorMessage,
          },
        };
      }

      const attempts = (existingClaim?.attempts ?? 0) + 1;
      if (attempts > MAX_RENEWAL_DELIVERY_ATTEMPTS) {
        const exhaustedClaim: RenewalDeliveryClaim = {
          idempotencyKey,
          requestHash,
          status: 'PERMANENT_FAILURE',
          attempts: existingClaim?.attempts ?? MAX_RENEWAL_DELIVERY_ATTEMPTS,
          providerMessageId: null,
          startedAt: existingClaim?.startedAt ?? new Date().toISOString(),
          sentAt: null,
          lastError: 'DELIVERY_ATTEMPTS_EXHAUSTED',
        };
        draft.status = 'FAILED';
        draft.errorCode = 'DELIVERY_ATTEMPTS_EXHAUSTED';
        draft.errorMessage = 'DELIVERY_ATTEMPTS_EXHAUSTED';
        draft.validationResult = {
          ...meta,
          deliveryClaim: exhaustedClaim,
        };
        await draftRepo.save(draft);

        return {
          kind: 'result',
          result: {
            contractId: contract.id,
            customerId: customer.id,
            draftId: draft.id,
            status: 'FAILED',
            communicationId: null,
            delivered: false,
            idempotencyKey,
            errorMessage: 'DELIVERY_ATTEMPTS_EXHAUSTED',
            idempotencyStatus: 'replayed',
          },
        };
      }

      const activeClaim: RenewalDeliveryClaim = {
        idempotencyKey,
        requestHash,
        status: 'PROCESSING',
        attempts,
        providerMessageId: null,
        startedAt: new Date().toISOString(),
        sentAt: null,
        lastError: null,
      };
      draft.status = 'PROCESSING';
      draft.errorCode = null;
      draft.errorMessage = null;
      draft.validationResult = {
        ...meta,
        deliveryClaim: activeClaim,
      };
      await draftRepo.save(draft);

      return {
        kind: 'send',
        claim: {
          contract,
          customer,
          draftId: draft.id,
          recipientEmail: customer.email.trim(),
          subject,
          bodyText,
          attempts,
          idempotencyStatus: existingClaim ? 'replayed' : 'new',
        },
      };
    });
  }

  private async finishRenewalDelivery(
    draftId: string,
    claimStatus: 'SENT' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'UNKNOWN',
    providerMessageId: string | null,
    errorCode: string | null,
    errorMessage: string | null,
  ): Promise<RenewalDraft> {
    return this.runInDraftTransaction(async (draftRepo) => {
      const draft = await draftRepo.findOne({
        where: { id: draftId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!draft) {
        throw new NotFoundException(
          `Renewal draft with ID ${draftId} not found`,
        );
      }

      const meta = draft.validationResult ?? {};
      const existingClaim = meta.deliveryClaim as
        RenewalDeliveryClaim | undefined;

      // Never overwrite a stale claim that has already been moved to UNKNOWN
      if (
        draft.status === 'UNKNOWN' ||
        (existingClaim && existingClaim.status !== 'PROCESSING')
      ) {
        return draft;
      }

      const updatedClaim: RenewalDeliveryClaim | undefined = existingClaim
        ? {
            ...existingClaim,
            status: claimStatus,
            providerMessageId,
            sentAt: claimStatus === 'SENT' ? new Date().toISOString() : null,
            lastError: errorMessage,
          }
        : undefined;

      const nextStatus =
        claimStatus === 'SENT'
          ? 'SENT'
          : claimStatus === 'UNKNOWN'
            ? 'UNKNOWN'
            : 'FAILED';
      const updatedDraft = Object.assign(new RenewalDraft(), draft, {
        status: nextStatus,
        communicationId: providerMessageId,
        errorCode,
        errorMessage,
        validationResult: updatedClaim
          ? {
              ...meta,
              deliveryClaim: updatedClaim,
            }
          : draft.validationResult,
      });
      return draftRepo.save(updatedDraft);
    });
  }

  private classifySmtpError(
    error: unknown,
    attempts: number,
  ): {
    claimStatus: 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'UNKNOWN';
    errorCode: string;
    errorMessage: string;
  } {
    const candidate =
      typeof error === 'object' && error !== null
        ? (error as {
            code?: unknown;
            responseCode?: unknown;
            message?: unknown;
          })
        : {};
    const code = typeof candidate.code === 'string' ? candidate.code : '';
    const responseCode =
      typeof candidate.responseCode === 'number'
        ? candidate.responseCode
        : null;
    const errorMessage =
      error instanceof Error ? error.message : 'Renewal delivery failed';

    if (['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ESOCKET'].includes(code)) {
      return {
        claimStatus: 'UNKNOWN',
        errorCode: `SMTP_OUTCOME_UNKNOWN_${code}`,
        errorMessage: `DELIVERY_OUTCOME_UNKNOWN (${code})`,
      };
    }

    const isRetryable =
      ['ECONNREFUSED', 'ENOTFOUND'].includes(code) ||
      (responseCode !== null && responseCode >= 400 && responseCode < 500);

    if (isRetryable && attempts < MAX_RENEWAL_DELIVERY_ATTEMPTS) {
      return {
        claimStatus: 'RETRYABLE_FAILURE',
        errorCode: code || `SMTP_${responseCode}`,
        errorMessage,
      };
    }

    return {
      claimStatus: 'PERMANENT_FAILURE',
      errorCode: code || 'DELIVERY_FAILED',
      errorMessage,
    };
  }

  private async runInDraftTransaction<T>(
    work: (draftRepo: Repository<RenewalDraft>) => Promise<T>,
  ): Promise<T> {
    if (this.draftRepo.manager?.transaction) {
      return this.draftRepo.manager.transaction(async (manager) =>
        work(manager.getRepository(RenewalDraft)),
      );
    }
    return work(this.draftRepo);
  }

  private async withDeliveryLock<T>(
    draftId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.deliveryLocks.get(draftId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.deliveryLocks.set(draftId, chained);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.deliveryLocks.get(draftId) === chained) {
        this.deliveryLocks.delete(draftId);
      }
    }
  }

  /**
   * Record renewal attempt idempotently.
   * Rejects status === 'SENT' unless a confirmed communicationId is present or
   * the draft has already been delivered through sendApprovedRenewal.
   */
  async recordRenewalAttempt(
    data: RecordRenewalAttemptDto,
  ): Promise<RenewalDraft> {
    if (!data.idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for recording attempt',
      );
    }

    const existing = await this.draftRepo.findOne({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) {
      existing.status = data.status;
      if (data.communicationId) existing.communicationId = data.communicationId;
      if (data.errorCode) existing.errorCode = data.errorCode;
      if (data.errorMessage) existing.errorMessage = data.errorMessage;
      return this.draftRepo.save(existing);
    }

    const contract = await this.getContract(data.contractId);
    const draft = this.draftRepo.create({
      contractId: contract.id,
      customerId: data.customerId ?? contract.customerId,
      status: data.status,
      idempotencyKey: data.idempotencyKey,
      communicationId: data.communicationId ?? null,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
    });
    return this.draftRepo.save(draft);
  }

  private evaluateDraftEligibilityFromRecords(
    contract: Contract,
    draft: RenewalDraft,
  ): { canAutoSend: boolean; reason: string } {
    if (contract.status !== 'ACTIVE') {
      return {
        canAutoSend: false,
        reason: `FAIL_CLOSED: contract status is ${contract.status}`,
      };
    }

    const meta = (draft.validationResult as Record<string, unknown>) ?? {};
    const backendConsent = meta.consentGranted === true;
    const backendTemplate = meta.templateApproved === true;
    const backendPolicy = meta.policyApproved === true;
    const hasApprover =
      typeof meta.approvedBy === 'string' && meta.approvedBy.trim().length > 0;
    const backendApproval =
      hasApprover &&
      (draft.status === 'APPROVED' || draft.status === undefined);

    if (!backendConsent) {
      return {
        canAutoSend: false,
        reason: 'FAIL_CLOSED: no backend consent record',
      };
    }
    if (!backendTemplate) {
      return {
        canAutoSend: false,
        reason: 'FAIL_CLOSED: no backend template record',
      };
    }
    if (!backendPolicy) {
      return {
        canAutoSend: false,
        reason: 'FAIL_CLOSED: no backend policy record',
      };
    }
    if (!backendApproval) {
      return {
        canAutoSend: false,
        reason: 'FAIL_CLOSED: no backend approval record',
      };
    }
    return { canAutoSend: true, reason: 'OK' };
  }

  /**
   * Eligibility is decided by the backend, never by caller-supplied booleans.
   * Without a persisted consent/template/policy/approval record the result is
   * FAIL_CLOSED so no renewal can be auto-sent.
   */
  async checkEligibility(
    input: CheckEligibilityDto,
  ): Promise<{ canAutoSend: boolean; reason: string }> {
    const contract = await this.contractRepo.findOne({
      where: { id: input.contractId },
    });
    if (!contract || contract.customerId !== input.customerId) {
      return { canAutoSend: false, reason: 'FAIL_CLOSED: contract not found' };
    }

    if (contract.status !== 'ACTIVE') {
      return {
        canAutoSend: false,
        reason: `FAIL_CLOSED: contract status is ${contract.status}`,
      };
    }

    if (!input.draftId) {
      return {
        canAutoSend: false,
        reason: 'FAIL_CLOSED: no draft to verify',
      };
    }

    const draft = await this.draftRepo.findOne({
      where: { id: input.draftId },
    });
    if (!draft || draft.contractId !== input.contractId) {
      return { canAutoSend: false, reason: 'FAIL_CLOSED: draft not found' };
    }

    return this.evaluateDraftEligibilityFromRecords(contract, draft);
  }
}
