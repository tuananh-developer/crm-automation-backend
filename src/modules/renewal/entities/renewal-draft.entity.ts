import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Contract } from './contract.entity.js';
import type { Customer } from '../../customers/entities/customer.entity.js';

@Entity('renewal_drafts')
@Index('IDX_renewal_drafts_contract_id', ['contractId'])
@Index('IDX_renewal_drafts_customer_id', ['customerId'])
@Index('IDX_renewal_drafts_status', ['status'])
@Index('UQ_renewal_drafts_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
export class RenewalDraft {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'renewal_date', type: 'timestamptz', nullable: true })
  renewalDate!: Date | null;

  @Column({ name: 'urgency', type: 'varchar', length: 20, nullable: true })
  urgency!: string | null;

  @Column({ name: 'recommendation', type: 'text', nullable: true })
  recommendation!: string | null;

  @Column({ name: 'draft_content', type: 'text', nullable: true })
  draftContent!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    unique: true,
  })
  idempotencyKey!: string;

  @Column({ name: 'ai_model', type: 'varchar', length: 100, nullable: true })
  aiModel!: string | null;

  @Column({ name: 'validation_result', type: 'jsonb', nullable: true })
  validationResult!: Record<string, unknown> | null;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({
    name: 'workflow_execution_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  workflowExecutionId!: string | null;

  @Column({
    name: 'communication_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  communicationId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('Contract', 'renewalDrafts', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract?: Contract;

  @ManyToOne('Customer', 'renewalDrafts', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;
}
