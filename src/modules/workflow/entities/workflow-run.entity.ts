import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkflowStatus } from '../enums/workflow.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { Customer } from '../../customers/entities/customer.entity.js';
import type { User } from '../../users/entities/user.entity.js';
import type { ReviewTask } from '../../review/entities/review-task.entity.js';

@Entity('workflow_runs')
@Index('IDX_workflow_runs_n8n_execution_id', ['n8nExecutionId'], {
  unique: true,
})
@Index('IDX_workflow_runs_lead_id', ['leadId'])
@Index('IDX_workflow_runs_customer_id', ['customerId'])
@Index('IDX_workflow_runs_status', ['status'])
export class WorkflowRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workflow_name', type: 'varchar', length: 150 })
  workflowName!: string;

  @Column({
    name: 'n8n_execution_id',
    type: 'varchar',
    length: 255,
    unique: true,
    nullable: true,
  })
  n8nExecutionId!: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId!: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'triggered_by_user_id', type: 'uuid', nullable: true })
  triggeredByUserId!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: WorkflowStatus.PENDING,
  })
  status!: WorkflowStatus;

  @Column({ name: 'input_payload', type: 'jsonb', nullable: true })
  inputPayload!: Record<string, any> | null;

  @Column({ name: 'output_payload', type: 'jsonb', nullable: true })
  outputPayload!: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('Lead', 'workflowRuns', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead | null;

  @ManyToOne('Customer', 'workflowRuns', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'triggered_by_user_id' })
  triggeredByUser?: User | null;

  @OneToMany('ReviewTask', 'workflowRun')
  reviewTasks?: ReviewTask[];
}
