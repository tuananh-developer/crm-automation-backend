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
import type { ConversationTranscript } from './conversation-transcript.entity.js';
import type { ConversationActionItem } from './conversation-action-item.entity.js';

@Entity('conversation_summaries')
@Index('idx_summaries_transcript_id', ['transcriptId'])
export class ConversationSummary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transcript_id', type: 'uuid' })
  transcriptId!: string;

  @Column({ name: 'summary_text', type: 'text' })
  summaryText!: string;

  @Column({ name: 'sentiment', type: 'varchar', length: 30, nullable: true })
  sentiment!: string | null;

  @Column({ name: 'intent', type: 'varchar', length: 100, nullable: true })
  intent!: string | null;

  @Column({ name: 'key_points', type: 'jsonb', nullable: true })
  keyPoints!: string[] | null;

  @Column({ name: 'raw_ai_output', type: 'jsonb', nullable: true })
  rawAIOutput!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('ConversationTranscript', 'summaries', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transcript_id' })
  transcript?: ConversationTranscript;

  @OneToMany('ConversationActionItem', 'summary')
  actionItems?: ConversationActionItem[];
}
