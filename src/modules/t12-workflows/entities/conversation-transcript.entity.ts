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
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';
import type { SalesMeeting } from './sales-meeting.entity.js';
import type { ConversationSummary } from './conversation-summary.entity.js';

@Entity('conversation_transcripts')
@Index('UQ_conversation_transcripts_idempotency', ['idempotencyKey'], {
  unique: true,
})
@Index('IDX_conversation_transcripts_meeting', ['meetingId', 'createdAt'])
export class ConversationTranscript {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'meeting_id', type: 'uuid', nullable: true })
  meetingId!: string | null;

  @Column({ name: 'workflow_run_id', type: 'uuid' })
  workflowRunId!: string;

  @Column({ name: 'source_type', type: 'varchar', length: 40 })
  sourceType!: string;

  @Column({ name: 'redacted_text', type: 'text' })
  redactedText!: string;

  @Column({ name: 'redaction_mode', type: 'varchar', length: 80 })
  redactionMode!: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('WorkflowRun', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun;

  @ManyToOne('SalesMeeting', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: SalesMeeting | null;

  @OneToMany('ConversationSummary', 'transcript')
  summaries?: ConversationSummary[];

  // Compatibility helpers and optional correlation properties
  customerId?: string | null;
  leadId?: string | null;
  createdBy?: string | null;
  lead?: { ownerId?: string | null } | null;
  customer?: { createdBy?: string | null } | null;

  get redactedContent(): string {
    return this.redactedText;
  }
  set redactedContent(value: string) {
    this.redactedText = value;
  }
}
