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
import type { ConversationSummary } from './conversation-summary.entity.js';
import type { User } from '../../users/entities/user.entity.js';

export enum ActionItemStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ActionItemApprovalState {
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('conversation_action_items')
@Index('idx_action_items_summary_id', ['summaryId'])
export class ConversationActionItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'summary_id', type: 'uuid' })
  summaryId!: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: ActionItemStatus.PENDING,
  })
  status!: ActionItemStatus;

  @Column({
    name: 'approval_state',
    type: 'varchar',
    length: 30,
    default: ActionItemApprovalState.PROPOSED,
  })
  approvalState!: ActionItemApprovalState;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('ConversationSummary', 'actionItems', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'summary_id' })
  summary?: ConversationSummary;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assignedUser?: User | null;
}
