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
import { FollowUpSequenceStatus } from '../enums/follow-up.enum.js';
import type { User } from '../../users/entities/user.entity.js';
import type { FollowUpStep } from './follow-up-step.entity.js';
import type { LeadFollowUpEnrollment } from './lead-follow-up-enrollment.entity.js';

@Entity('follow_up_sequences')
@Index('IDX_follow_up_sequences_name', ['name'], { unique: true })
export class FollowUpSequence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 150, unique: true })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: FollowUpSequenceStatus.DRAFT,
  })
  status!: FollowUpSequenceStatus;

  get isActive(): boolean {
    return this.status === FollowUpSequenceStatus.ACTIVE;
  }

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updater?: User | null;

  @OneToMany('FollowUpStep', 'sequence')
  steps?: FollowUpStep[];

  @OneToMany('LeadFollowUpEnrollment', 'sequence')
  enrollments?: LeadFollowUpEnrollment[];
}
