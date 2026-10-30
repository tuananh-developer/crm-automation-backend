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
import type { Customer } from '../../customers/entities/customer.entity.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { User } from '../../users/entities/user.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';
import type { ConversationSummary } from './conversation-summary.entity.js';

export enum TranscriptProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('conversation_transcripts')
@Index('idx_transcripts_customer_id', ['customerId'])
@Index('idx_transcripts_lead_id', ['leadId'])
@Index('idx_transcripts_status', ['processingStatus'])
export class ConversationTranscript {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'meeting_id', type: 'uuid', nullable: true })
  meetingId!: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId!: string | null;

  @Column({ name: 'source_type', type: 'varchar', length: 50, default: 'CALL' })
  sourceType!: string;

  @Column({ name: 'redacted_content', type: 'text' })
  redactedContent!: string;

  @Column({
    name: 'processing_status',
    type: 'varchar',
    length: 30,
    default: TranscriptProcessingStatus.PENDING,
  })
  processingStatus!: TranscriptProcessingStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'workflow_run_id', type: 'uuid', nullable: true })
  workflowRunId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('Customer', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @ManyToOne('Lead', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead | null;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User | null;

  @ManyToOne('WorkflowRun', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun | null;

  @OneToMany('ConversationSummary', 'transcript')
  summaries?: ConversationSummary[];
}
