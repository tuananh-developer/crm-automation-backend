import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ConversationSummary } from './conversation-summary.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';
import type { User } from '../../users/entities/user.entity.js';

export enum ActionItemStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export enum ActionItemApprovalState {
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('conversation_action_items')
@Index('UQ_conversation_action_items_idempotency', ['idempotencyKey'], {
  unique: true,
})
@Index('IDX_conversation_action_items_summary', ['summaryId'])
export class ConversationActionItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'summary_id', type: 'uuid' })
  summaryId!: string;

  @Column({ name: 'workflow_run_id', type: 'uuid' })
  workflowRunId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'owner_attendee_id', type: 'uuid', nullable: true })
  ownerAttendeeId!: string | null;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'text', nullable: true })
  evidence!: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0 })
  confidence!: number;

  @Column({ name: 'requires_confirmation', type: 'boolean', default: true })
  requiresConfirmation!: boolean;

  @Column({ type: 'varchar', length: 30, default: 'PENDING_CONFIRMATION' })
  status!: string;

  @Column({ name: 'confirmed_by', type: 'uuid', nullable: true })
  confirmedBy!: string | null;

  @Column({ name: 'confirmation_note', type: 'text', nullable: true })
  confirmationNote!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('ConversationSummary', 'actionItems', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'summary_id' })
  summary?: ConversationSummary;

  @ManyToOne('WorkflowRun', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_attendee_id' })
  assignedUser?: User | null;

  get assignedTo(): string | null {
    return this.ownerAttendeeId;
  }
  set assignedTo(value: string | null) {
    this.ownerAttendeeId = value;
  }

  get dueAt(): Date | null {
    return this.dueDate;
  }
  set dueAt(value: Date | null) {
    this.dueDate = value;
  }

  get approvalState(): ActionItemApprovalState {
    if (this.status === 'CONFIRMED' || this.requiresConfirmation === false) {
      return ActionItemApprovalState.APPROVED;
    }
    if (this.status === 'REJECTED') {
      return ActionItemApprovalState.REJECTED;
    }
    return ActionItemApprovalState.PROPOSED;
  }
  set approvalState(value: ActionItemApprovalState) {
    if (value === ActionItemApprovalState.APPROVED) {
      this.requiresConfirmation = false;
      this.status = 'CONFIRMED';
    } else if (value === ActionItemApprovalState.REJECTED) {
      this.requiresConfirmation = false;
      this.status = 'REJECTED';
    } else {
      this.requiresConfirmation = true;
      this.status = 'PENDING_CONFIRMATION';
    }
  }
}
