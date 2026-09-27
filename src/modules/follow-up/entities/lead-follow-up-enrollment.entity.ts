import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EnrollmentStatus } from '../enums/follow-up.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { FollowUpSequence } from './follow-up-sequence.entity.js';
import type { FollowUpStep } from './follow-up-step.entity.js';
import type { FollowUpExecution } from './follow-up-execution.entity.js';
import type { User } from '../../users/entities/user.entity.js';

@Entity('lead_follow_up_enrollments')
@Index('IDX_enrollments_lead_id', ['leadId'])
@Index('IDX_enrollments_sequence_id', ['sequenceId'])
@Index('IDX_enrollments_status', ['status'])
export class LeadFollowUpEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @Column({ name: 'sequence_id', type: 'uuid' })
  sequenceId!: string;

  @Column({ name: 'current_step_id', type: 'uuid', nullable: true })
  currentStepId!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: EnrollmentStatus.ACTIVE,
  })
  status!: EnrollmentStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy!: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('Lead', 'enrollments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @ManyToOne('FollowUpSequence', 'enrollments', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sequence_id' })
  sequence?: FollowUpSequence;

  @ManyToOne('FollowUpStep', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_step_id' })
  currentStep?: FollowUpStep | null;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by' })
  assignedByUser?: User | null;

  @OneToMany('FollowUpExecution', 'enrollment')
  executions?: FollowUpExecution[];
}
