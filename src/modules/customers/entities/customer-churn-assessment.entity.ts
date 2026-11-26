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
import type { Customer } from './customer.entity.js';
import type { CustomerTask } from './customer-task.entity.js';

@Entity('customer_churn_assessments')
@Index('IDX_customer_churn_assessments_customer_id', ['customerId'])
@Index('IDX_customer_churn_assessments_assessed_at', ['assessedAt'])
@Index('IDX_customer_churn_assessments_risk_level', ['riskLevel'])
@Index(
  'UQ_customer_churn_assessments_customer_as_of_date',
  ['customerId', 'asOfDate'],
  {
    unique: true,
  },
)
export class CustomerChurnAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'score', type: 'integer', nullable: true })
  score!: number | null;

  @Column({
    name: 'risk_level',
    type: 'varchar',
    length: 40,
  })
  riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_DATA';

  @Column({ name: 'as_of_date', type: 'date', nullable: true })
  asOfDate!: string | null;

  @Column({
    name: 'policy_version',
    type: 'varchar',
    length: 40,
    default: 'v1',
  })
  policyVersion!: string;

  @Column({ name: 'evidence', type: 'jsonb', nullable: true })
  evidence!: Array<Record<string, unknown>> | null;

  @Column({ name: 'coverage', type: 'jsonb', nullable: true })
  coverage!: Record<string, unknown> | null;

  @Column({ name: 'workflow_run_id', type: 'uuid', nullable: true })
  workflowRunId!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({
    name: 'assessed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  assessedAt!: Date;

  @ManyToOne('Customer', 'churnAssessments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @OneToMany('CustomerTask', 'assessment')
  tasks?: CustomerTask[];
}
