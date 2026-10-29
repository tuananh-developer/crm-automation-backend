import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Customer } from './customer.entity.js';
import type { CustomerChurnAssessment } from './customer-churn-assessment.entity.js';

@Entity('customer_tasks')
@Index('IDX_customer_tasks_customer_id', ['customerId'])
@Index('IDX_customer_tasks_assessment_id', ['assessmentId'])
@Index('IDX_customer_tasks_status', ['status'])
@Index('UQ_customer_tasks_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
export class CustomerTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'assessment_id', type: 'uuid', nullable: true })
  assessmentId!: string | null;

  @Column({
    name: 'task_type',
    type: 'varchar',
    length: 40,
    default: 'RETENTION',
  })
  taskType!: string;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'OPEN' })
  status!: string;

  @Column({ name: 'priority', type: 'varchar', length: 20, default: 'HIGH' })
  priority!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    unique: true,
  })
  idempotencyKey!: string;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @ManyToOne('Customer', 'customerTasks', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @ManyToOne('CustomerChurnAssessment', 'tasks', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'assessment_id' })
  assessment?: CustomerChurnAssessment | null;
}
