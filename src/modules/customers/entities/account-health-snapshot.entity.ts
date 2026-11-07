import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Customer } from './customer.entity.js';

@Entity('account_health_snapshots')
@Index('IDX_account_health_snapshots_customer_id', ['customerId'])
@Index('IDX_account_health_snapshots_assessed_at', ['assessedAt'])
export class AccountHealthSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'score', type: 'integer' })
  score!: number;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status!: string;

  @Column({ name: 'breakdown', type: 'jsonb', nullable: true })
  breakdown!: Record<string, unknown> | null;

  @Column({ name: 'evidence', type: 'jsonb', nullable: true })
  evidence!: unknown[] | null;

  @Column({ name: 'missing_data', type: 'jsonb', nullable: true })
  missingData!: string[] | null;

  @Column({ name: 'data_coverage', type: 'jsonb', nullable: true })
  dataCoverage!: Record<string, unknown> | null;

  @Column({ name: 'assessed_at', type: 'timestamptz' })
  assessedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('Customer', 'accountHealthSnapshots', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;
}
