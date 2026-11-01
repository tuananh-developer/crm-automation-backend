import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('quote_approvals')
@Index('UQ_quote_approvals_quote', ['quoteId'], { unique: true })
@Index('UQ_quote_approvals_idempotency', ['idempotencyKey'], { unique: true })
export class QuoteApproval {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quote_id', type: 'uuid' })
  quoteId!: string;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy!: string;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ name: 'decision_comment', type: 'text', nullable: true })
  decisionComment!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey!: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
