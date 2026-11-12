import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';

/**
 * RenewalService is the single backend authority for renewal decisions.
 * n8n workflows must never recompute urgency, eligibility, or consent on
 * their own; this service enforces that.
 */
@Injectable()
export class RenewalService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(RenewalDraft)
    private readonly draftRepo: Repository<RenewalDraft>,
  ) {}

  async findRenewalContracts(days: number): Promise<Contract[]> {
    const now = new Date();
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.contractRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: 'ACTIVE' })
      .andWhere('c.renewalDate IS NOT NULL')
      .andWhere('c.renewalDate >= :now', { now })
      .andWhere('c.renewalDate <= :end', { end })
      .getMany();
  }

  async getContract(id: string): Promise<Contract | null> {
    return this.contractRepo.findOne({ where: { id } });
  }

  /**
   * Backend-canonical urgency levels. n8n must use this function only.
   */
  calculateUrgency(renewalDate: Date | null): {
    level: string;
    daysRemaining: number;
  } {
    if (!renewalDate) return { level: 'UNKNOWN', daysRemaining: -1 };
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
  async saveDraft(data: Partial<RenewalDraft>): Promise<RenewalDraft> {
    if (!data.idempotencyKey) {
      throw new Error('idempotencyKey is required for renewal draft creation');
    }

    const existing = await this.draftRepo.findOne({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const draft = this.draftRepo.create(data);
    return this.draftRepo.save(draft);
  }

  async findDraftByIdempotencyKey(key: string): Promise<RenewalDraft | null> {
    return this.draftRepo.findOne({ where: { idempotencyKey: key } });
  }

  /**
   * Eligibility is decided by the backend, never by caller-supplied booleans.
   * Without a persisted consent/template/policy record the result is
   * FAIL_CLOSED so no renewal can be auto-sent.
   */
  async checkEligibility(input: {
    contractId: string;
    customerId: string;
    draftId?: string;
    hasConsent?: boolean;
    hasTemplate?: boolean;
    policyAllows?: boolean;
    needsApproval?: boolean;
  }): Promise<{ canAutoSend: boolean; reason: string }> {
    const contract = await this.contractRepo.findOne({
      where: { id: input.contractId },
    });
    if (!contract || contract.customerId !== input.customerId) {
      return { canAutoSend: false, reason: 'FAIL_CLOSED: contract not found' };
    }

    if (input.draftId) {
      const draft = await this.draftRepo.findOne({
        where: { id: input.draftId },
      });
      if (!draft || draft.contractId !== input.contractId) {
        return { canAutoSend: false, reason: 'FAIL_CLOSED: draft not found' };
      }
      // Backend authority: caller booleans are advisory only. The backend
      // must have actually recorded consent/template/policy approval in the
      // draft validation result; otherwise the renewal cannot be auto-sent.
      const meta = (draft.validationResult as Record<string, unknown>) ?? {};
      const backendConsent = meta.consentGranted === true;
      const backendTemplate = meta.templateApproved === true;
      const backendPolicy = meta.policyApproved === true;
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
      return { canAutoSend: true, reason: 'OK' };
    }

    return { canAutoSend: false, reason: 'FAIL_CLOSED: no draft to verify' };
  }
}
