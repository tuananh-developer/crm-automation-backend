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
import { ExecutionStatus } from '../enums/follow-up.enum.js';
import type { LeadFollowUpEnrollment } from './lead-follow-up-enrollment.entity.js';
import type { FollowUpStep } from './follow-up-step.entity.js';

@Entity('follow_up_executions')
@Index('IDX_executions_enrollment_id', ['enrollmentId'])
@Index('IDX_executions_step_id', ['stepId'])
@Index('IDX_executions_status', ['status'])
@Index('IDX_executions_scheduled_at', ['scheduledAt'])
export class FollowUpExecution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'step_id', type: 'uuid' })
  stepId!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: ExecutionStatus.PENDING,
  })
  status!: ExecutionStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId!: string | null;

  @Column({ name: 'request_payload', type: 'jsonb', nullable: true })
  requestPayload!: Record<string, any> | null;

  @Column({ name: 'response_payload', type: 'jsonb', nullable: true })
  responsePayload!: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('LeadFollowUpEnrollment', 'executions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: LeadFollowUpEnrollment;

  @ManyToOne('FollowUpStep', 'executions', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'step_id' })
  step?: FollowUpStep;
}
