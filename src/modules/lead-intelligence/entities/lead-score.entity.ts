import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ScoreLabel } from '../enums/lead-intelligence.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';

@Entity('lead_scores')
@Index('IDX_lead_scores_lead_id_created_at', ['leadId', 'createdAt'])
export class LeadScore {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @Column({ name: 'score', type: 'numeric', precision: 5, scale: 2 })
  score!: number;

  @Column({
    name: 'label',
    type: 'varchar',
    length: 30,
  })
  label!: ScoreLabel;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason!: string | null;

  @Column({
    name: 'model_provider',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  modelProvider!: string | null;

  @Column({ name: 'model_name', type: 'varchar', length: 150, nullable: true })
  modelName!: string | null;

  @Column({
    name: 'model_version',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  modelVersion!: string | null;

  @Column({ name: 'scoring_features', type: 'jsonb', nullable: true })
  scoringFeatures!: Record<string, any> | null;

  @Column({ name: 'input_snapshot', type: 'jsonb', nullable: true })
  inputSnapshot!: Record<string, any> | null;

  @Column({ name: 'output_snapshot', type: 'jsonb', nullable: true })
  outputSnapshot!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('Lead', 'scores', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;
}
