import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QualificationStatus } from '../enums/lead-intelligence.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';

@Entity('lead_qualifications')
@Index('IDX_lead_qualifications_lead_id_created_at', ['leadId', 'createdAt'])
export class LeadQualification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
  })
  status!: QualificationStatus;

  @Column({ name: 'intent', type: 'varchar', length: 100, nullable: true })
  intent!: string | null;

  @Column({
    name: 'confidence',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidence!: number | null;

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

  @Column({ name: 'input_snapshot', type: 'jsonb', nullable: true })
  inputSnapshot!: Record<string, any> | null;

  @Column({ name: 'output_snapshot', type: 'jsonb', nullable: true })
  outputSnapshot!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'workflow_run_id', type: 'uuid', nullable: true })
  workflowRunId!: string | null;

  @ManyToOne('Lead', 'qualifications', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @ManyToOne('WorkflowRun', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun | null;
}
