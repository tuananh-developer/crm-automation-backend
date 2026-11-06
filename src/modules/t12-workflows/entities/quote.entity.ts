import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('quotes')
@Index('UQ_quotes_workflow_run', ['workflowRunId'], { unique: true })
@Index('IDX_quotes_customer_created', ['customerId', 'createdAt'])
@Index('IDX_quotes_lead_created', ['leadId', 'createdAt'])
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workflow_run_id', type: 'uuid', unique: true })
  workflowRunId!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'executive_summary', type: 'text', nullable: true })
  executiveSummary!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  subtotal!: string;

  @Column({ name: 'discount_total', type: 'numeric', precision: 14, scale: 2 })
  discountTotal!: string;

  @Column({ name: 'tax_total', type: 'numeric', precision: 14, scale: 2 })
  taxTotal!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2 })
  totalAmount!: string;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

  @Column({ name: 'approval_required', type: 'boolean', default: true })
  approvalRequired!: boolean;

  @Column({
    name: 'submitted_for_approval_at',
    type: 'timestamptz',
    nullable: true,
  })
  submittedForApprovalAt!: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'pricing_snapshot', type: 'jsonb' })
  pricingSnapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
