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
import { LeadStatus } from '../enums/lead.enum.js';
import { LeadSource } from './lead-source.entity.js';
import type { User } from '../../users/entities/user.entity.js';
import type { Interaction } from './interaction.entity.js';
import type { LeadQualification } from '../../lead-intelligence/entities/lead-qualification.entity.js';
import type { LeadEnrichment } from '../../lead-intelligence/entities/lead-enrichment.entity.js';
import type { LeadScore } from '../../lead-intelligence/entities/lead-score.entity.js';
import type { LeadFollowUpEnrollment } from '../../follow-up/entities/lead-follow-up-enrollment.entity.js';
import type { Customer } from '../../customers/entities/customer.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';
import type { ReviewTask } from '../../review/entities/review-task.entity.js';
import type { Notification } from '../../notifications/entities/notification.entity.js';

@Entity('leads')
@Index('IDX_leads_email', ['email'])
@Index('IDX_leads_status', ['status'])
@Index('IDX_leads_source_id', ['sourceId'])
@Index('IDX_leads_owner_id', ['ownerId'])
@Index('IDX_leads_created_at', ['createdAt'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 320 })
  email!: string;

  @Column({ name: 'phone', type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

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

  @Column({ name: 'job_title', type: 'varchar', length: 150, nullable: true })
  jobTitle!: string | null;

  @Column({ name: 'company_size', type: 'integer', nullable: true })
  companySize!: number | null;

  @Column({ name: 'industry', type: 'varchar', length: 150, nullable: true })
  industry!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: LeadStatus.NEW,
  })
  status!: LeadStatus;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;

  @Column({ name: 'converted_customer_id', type: 'uuid', nullable: true })
  convertedCustomerId!: string | null;

  @Column({ name: 'converted_by', type: 'uuid', nullable: true })
  convertedBy!: string | null;

  @Column({ name: 'converted_at', type: 'timestamptz', nullable: true })
  convertedAt!: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => LeadSource, (source) => source.leads, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'source_id' })
  source?: LeadSource;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner?: User | null;

  @ManyToOne('Customer', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'converted_customer_id' })
  convertedCustomer?: Customer | null;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'converted_by' })
  convertedByUser?: User | null;

  @OneToMany('Interaction', 'lead')
  interactions?: Interaction[];

  @OneToMany('LeadQualification', 'lead')
  qualifications?: LeadQualification[];

  @OneToMany('LeadEnrichment', 'lead')
  enrichments?: LeadEnrichment[];

  @OneToMany('LeadScore', 'lead')
  scores?: LeadScore[];

  @OneToMany('LeadFollowUpEnrollment', 'lead')
  enrollments?: LeadFollowUpEnrollment[];

  @OneToMany('WorkflowRun', 'lead')
  workflowRuns?: WorkflowRun[];

  @OneToMany('ReviewTask', 'lead')
  reviewTasks?: ReviewTask[];

  @OneToMany('Notification', 'lead')
  notifications?: Notification[];
}
