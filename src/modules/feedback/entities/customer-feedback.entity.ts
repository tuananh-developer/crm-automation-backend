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
import type { Customer } from '../../customers/entities/customer.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';

export enum FeedbackStatus {
  NEW = 'NEW',
  PROCESSED = 'PROCESSED',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
}

@Entity('customer_feedback')
@Index('idx_feedback_customer_id', ['customerId'])
@Index('idx_feedback_status', ['status'])
export class CustomerFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'source', type: 'varchar', length: 50, default: 'WEB' })
  source!: string;

  @Column({ name: 'content', type: 'text' })
  content!: string;

  @Column({
    name: 'rating',
    type: 'numeric',
    precision: 3,
    scale: 1,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | number | null) =>
        value !== null && value !== undefined
          ? parseFloat(value as string)
          : null,
    },
  })
  rating!: number | null;

  @Column({ name: 'sentiment', type: 'varchar', length: 30, nullable: true })
  sentiment!: string | null;

  @Column({ name: 'category', type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ name: 'urgency', type: 'varchar', length: 30, nullable: true })
  urgency!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: FeedbackStatus.NEW,
  })
  status!: FeedbackStatus;

  @Column({ name: 'raw_ai_output', type: 'jsonb', nullable: true })
  rawAIOutput!: Record<string, any> | null;

  @Column({ name: 'workflow_run_id', type: 'uuid', nullable: true })
  workflowRunId!: string | null;

  @Column({
    name: 'received_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  receivedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('Customer', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @ManyToOne('WorkflowRun', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun | null;
}
