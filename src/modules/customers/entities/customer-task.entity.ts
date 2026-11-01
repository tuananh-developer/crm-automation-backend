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
import type { Customer } from './customer.entity.js';
import type { User } from '../../users/entities/user.entity.js';
import type { CustomerFeedback } from '../../feedback/entities/customer-feedback.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';

export enum CustomerTaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum CustomerTaskStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('customer_tasks')
@Index('IDX_customer_tasks_customer_id', ['customerId'])
@Index('IDX_customer_tasks_assessment_id', ['assessmentId'])
@Index('IDX_customer_tasks_status', ['status'])
@Index('UQ_customer_tasks_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
export class CustomerTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'assessment_id', type: 'uuid', nullable: true })
  assessmentId!: string | null;

  @Column({ name: 'churn_assessment_id', type: 'uuid', nullable: true })
  churnAssessmentId!: string | null;

  @Column({ name: 'customer_feedback_id', type: 'uuid', nullable: true })
  customerFeedbackId!: string | null;

  @Column({ name: 'customer_issue_id', type: 'uuid', nullable: true })
  customerIssueId!: string | null;

  @Column({ name: 'health_assessment_id', type: 'uuid', nullable: true })
  healthAssessmentId!: string | null;

  @Column({ name: 'workflow_run_id', type: 'uuid', nullable: true })
  workflowRunId!: string | null;

  @Column({
    name: 'task_type',
    type: 'varchar',
    length: 50,
    default: 'RETENTION',
  })
  taskType!: string;

  @Column({
    name: 'title',
    type: 'varchar',
    length: 255,
    default: 'Customer Task',
  })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    name: 'priority',
    type: 'varchar',
    length: 30,
    default: CustomerTaskPriority.MEDIUM,
  })
  priority!: CustomerTaskPriority | string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: CustomerTaskStatus.OPEN,
  })
  status!: CustomerTaskStatus | string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    unique: true,
  })
  idempotencyKey!: string;

  @Column({
    name: 'source_entity_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  sourceEntityType!: string | null;

  @Column({ name: 'source_entity_id', type: 'uuid', nullable: true })
  sourceEntityId!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('Customer', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assignedUser?: User | null;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User | null;

  @ManyToOne('CustomerFeedback', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_feedback_id' })
  feedback?: CustomerFeedback | null;

  @ManyToOne('WorkflowRun', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun | null;
}
