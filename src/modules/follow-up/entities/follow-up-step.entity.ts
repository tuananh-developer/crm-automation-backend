import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { FollowUpSequence } from './follow-up-sequence.entity.js';
import type { FollowUpExecution } from './follow-up-execution.entity.js';

@Entity('follow_up_steps')
@Unique('UQ_follow_up_steps_sequence_step_order', ['sequenceId', 'stepOrder'])
@Index('IDX_follow_up_steps_sequence_step_order', ['sequenceId', 'stepOrder'])
export class FollowUpStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sequence_id', type: 'uuid' })
  sequenceId!: string;

  @Column({ name: 'step_order', type: 'integer' })
  stepOrder!: number;

  @Column({
    name: 'delay_minutes',
    type: 'integer',
    default: 0,
    nullable: true,
  })
  delayMinutes!: number | null;

  @Column({ name: 'channel', type: 'varchar', length: 50 })
  channel!: string;

  @Column({ name: 'action_type', type: 'varchar', length: 50 })
  actionType!: string;

  @Column({
    name: 'subject_template',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  subjectTemplate!: string | null;

  @Column({ name: 'content_template', type: 'text', nullable: true })
  contentTemplate!: string | null;

  @Column({ name: 'conditions', type: 'jsonb', nullable: true })
  conditions!: Record<string, any> | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('FollowUpSequence', 'steps', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sequence_id' })
  sequence?: FollowUpSequence;

  @OneToMany('FollowUpExecution', 'step')
  executions?: FollowUpExecution[];
}
