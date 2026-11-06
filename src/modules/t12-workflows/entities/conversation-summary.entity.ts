import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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
}
