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
import { ReviewDecision, ReviewStatus } from '../enums/review.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';
import type { User } from '../../users/entities/user.entity.js';
import type { Notification } from '../../notifications/entities/notification.entity.js';

@Entity('review_tasks')
@Index('IDX_review_tasks_lead_id', ['leadId'])
@Index('IDX_review_tasks_workflow_run_id', ['workflowRunId'])
@Index('IDX_review_tasks_assigned_to', ['assignedTo'])
@Index('IDX_review_tasks_status', ['status'])
export class ReviewTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @Column({ name: 'workflow_run_id', type: 'uuid', nullable: true })
  workflowRunId!: string | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: ReviewStatus.PENDING,
  })
  status!: ReviewStatus;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason!: string | null;

  @Column({
    name: 'decision',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  decision!: ReviewDecision | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @ManyToOne('Lead', 'reviewTasks', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @ManyToOne('WorkflowRun', 'reviewTasks', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun | null;

  @ManyToOne('User', 'reviewTasks', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assignee?: User | null;

  @OneToMany('Notification', 'reviewTask')
  notifications?: Notification[];
}
