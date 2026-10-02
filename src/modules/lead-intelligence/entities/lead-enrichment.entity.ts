import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EnrichmentStatus } from '../enums/lead-intelligence.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';

@Entity('lead_enrichments')
@Index('IDX_lead_enrichments_lead_id_created_at', ['leadId', 'createdAt'])
export class LeadEnrichment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @Column({ name: 'workflow_run_id', type: 'uuid', nullable: true })
  workflowRunId!: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 100 })
  provider!: string;

  @Column({
    name: 'external_request_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  externalRequestId!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
  })
  status!: EnrichmentStatus;

  @Column({
    name: 'company_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  companyName!: string | null;

  @Column({
    name: 'company_website',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  companyWebsite!: string | null;

  @Column({
    name: 'company_industry',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  companyIndustry!: string | null;

  @Column({ name: 'company_size', type: 'integer', nullable: true })
  companySize!: number | null;

  @Column({
    name: 'contact_job_title',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  contactJobTitle!: string | null;

  @Column({
    name: 'contact_linkedin_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  contactLinkedinUrl!: string | null;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse!: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'enriched_at', type: 'timestamptz' })
  enrichedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('Lead', 'enrichments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @ManyToOne('WorkflowRun', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflow_run_id' })
  workflowRun?: WorkflowRun | null;
}
