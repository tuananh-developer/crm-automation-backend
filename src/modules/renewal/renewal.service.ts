import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';

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

  calculateUrgency(renewalDate: Date | null): {
    level: string;
    daysRemaining: number;
  } {
    if (!renewalDate) return { level: 'UNKNOWN', daysRemaining: -1 };
    const now = new Date();
    const diff = renewalDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    if (days <= 7) return { level: 'CRITICAL', daysRemaining: days };
    if (days <= 30) return { level: 'HIGH', daysRemaining: days };
    if (days <= 60) return { level: 'MEDIUM', daysRemaining: days };
    return { level: 'LOW', daysRemaining: days };
  }

  async saveDraft(data: Partial<RenewalDraft>): Promise<RenewalDraft> {
    const draft = this.draftRepo.create(data);
    return this.draftRepo.save(draft);
  }

  async findDraftByIdempotencyKey(key: string): Promise<RenewalDraft | null> {
    return this.draftRepo.findOne({ where: { idempotencyKey: key } });
  }
}
