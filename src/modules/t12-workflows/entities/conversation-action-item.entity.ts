import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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
}
