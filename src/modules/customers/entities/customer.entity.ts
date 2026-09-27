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
import type { User } from '../../users/entities/user.entity.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { CustomerSegment } from './customer-segment.entity.js';
import type { WorkflowRun } from '../../workflow/entities/workflow-run.entity.js';
import type { Notification } from '../../notifications/entities/notification.entity.js';

@Entity('customers')
@Index('IDX_customers_email', ['email'])
@Index('IDX_customers_status', ['status'])
@Index('IDX_customers_company_name', ['companyName'])
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 200 })
  name!: string;

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

  @Column({ name: 'status', type: 'varchar', length: 30, nullable: true })
  status!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updater?: User | null;

  @OneToMany('Lead', 'convertedCustomer')
  convertedLeads?: Lead[];

  @OneToMany('CustomerSegment', 'customer')
  customerSegments?: CustomerSegment[];

  @OneToMany('WorkflowRun', 'customer')
  workflowRuns?: WorkflowRun[];

  @OneToMany('Notification', 'customer')
  notifications?: Notification[];
}
