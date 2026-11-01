import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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
}
