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
import type { ConversationTranscript } from './conversation-transcript.entity.js';
import type { ConversationActionItem } from './conversation-action-item.entity.js';

@Entity('conversation_summaries')
@Index('UQ_conversation_summaries_workflow_run', ['workflowRunId'], {
  unique: true,
})
@Index('IDX_conversation_summaries_transcript', ['transcriptId'])
export class ConversationSummary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'meeting_id', type: 'uuid', nullable: true })
  meetingId!: string | null;

  @Column({ name: 'transcript_id', type: 'uuid' })
  transcriptId!: string;

  @Column({ name: 'workflow_run_id', type: 'uuid' })
  workflowRunId!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  decisions!: Array<Record<string, unknown>>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  risks!: Array<Record<string, unknown>>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('ConversationTranscript', 'summaries', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transcript_id' })
  transcript?: ConversationTranscript;

  @ManyToOne('WorkflowRun', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun;

  @ManyToOne('SalesMeeting', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: SalesMeeting | null;

  @OneToMany('ConversationActionItem', 'summary')
  actionItems?: ConversationActionItem[];

  get summaryText(): string {
    return this.summary;
  }
  set summaryText(value: string) {
    this.summary = value;
  }
}
