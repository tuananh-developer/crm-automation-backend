import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import type {
  CheckEligibilityDto,
  CreateContractDto,
  RecordRenewalAttemptDto,
  SaveRenewalDraftDto,
  UpdateContractDto,
} from './dto/renewal.dto.js';

/**
 * RenewalService is the single backend authority for renewal decisions.
 * n8n workflows must never recompute urgency, eligibility, or consent on
 * their own; this service enforces that.
 */
@Injectable()
export class RenewalService {
  private readonly logger = new Logger(RenewalService.name);

  constructor(
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(RenewalDraft)
    private readonly draftRepo: Repository<RenewalDraft>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  /**
   * Create a customer contract with authoritative customer existence check,
   * date validation and duplicate contract number check.
   */
  async createContract(dto: CreateContractDto): Promise<Contract> {
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException(
        `Customer with ID ${dto.customerId} not found`,
      );
    }

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
   * List contracts, optionally filtered by customerId or status.
   */
  async listContracts(filter?: {
    customerId?: string;
    status?: string;
  }): Promise<Contract[]> {
    const where: Record<string, unknown> = {};
    if (filter?.customerId) where.customerId = filter.customerId;
    if (filter?.status) where.status = filter.status;
    return this.contractRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get single contract by ID. Throws NotFoundException if not found.
   */
  async getContract(id: string): Promise<Contract> {
    const contract = await this.contractRepo.findOne({
      where: { id },
    });
    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found`);
    }
    return contract;
  }

  /**
   * Update an existing contract.
   */
  async updateContract(id: string, dto: UpdateContractDto): Promise<Contract> {
    const contract = await this.getContract(id);

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
  async findRenewalContracts(days: number = 30): Promise<Contract[]> {
    const now = new Date();
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.contractRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: 'ACTIVE' })
      .andWhere('c.renewalDate IS NOT NULL')
      .andWhere('c.renewalDate >= :now', { now })
      .andWhere('c.renewalDate <= :end', { end })
      .orderBy('c.renewalDate', 'ASC')
      .getMany();
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
   * Idempotent draft save. Reusing an idempotency key returns the existing
   * draft instead of creating a duplicate.
   */
  async saveDraft(data: SaveRenewalDraftDto): Promise<RenewalDraft> {
    if (!data.idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for renewal draft creation',
      );
    }

    const existing = await this.draftRepo.findOne({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) {
      return existing;
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

    const draft = this.draftRepo.create({
      contractId: data.contractId,
      customerId: data.customerId,
      renewalDate: data.renewalDate ? new Date(data.renewalDate) : null,
      urgency: data.urgency ?? null,
      recommendation: data.recommendation ?? null,
      draftContent: data.draftContent ?? null,
      status: data.status ?? 'DRAFT',
      idempotencyKey: data.idempotencyKey,
      aiModel: data.aiModel ?? null,
      validationResult: data.validationResult ?? null,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
      workflowExecutionId: data.workflowExecutionId ?? null,
      communicationId: data.communicationId ?? null,
    });
    return this.draftRepo.save(draft);
  }

  async findDraftByIdempotencyKey(key: string): Promise<RenewalDraft | null> {
    return this.draftRepo.findOne({ where: { idempotencyKey: key } });
  }

  async getDraft(id: string): Promise<RenewalDraft> {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) {
      throw new NotFoundException(`Renewal draft with ID ${id} not found`);
    }
    return draft;
  }

  async listDraftsForContract(contractId: string): Promise<RenewalDraft[]> {
    return this.draftRepo.find({
      where: { contractId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Record renewal attempt idempotently.
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

  /**
   * Eligibility is decided by the backend, never by caller-supplied booleans.
   * Without a persisted consent/template/policy record the result is
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

    // Backend authority: caller booleans are advisory only and NEVER trusted.
    // The backend must have actually recorded consent/template/policy approval
    // in the draft validation result; otherwise the renewal cannot be auto-sent.
    const meta = (draft.validationResult as Record<string, unknown>) ?? {};
    const backendConsent = meta.consentGranted === true;
    const backendTemplate = meta.templateApproved === true;
    const backendPolicy = meta.policyApproved === true;
    const backendApproval =
      meta.approvedBy !== undefined || draft.status === 'APPROVED';

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
}
