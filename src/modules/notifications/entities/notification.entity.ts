import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { Customer } from '../../customers/entities/customer.entity.js';
import type { ReviewTask } from '../../review/entities/review-task.entity.js';

@Entity('notifications')
@Index('IDX_notifications_user_id', ['userId'])
@Index('IDX_notifications_is_read', ['isRead'])
@Index('IDX_notifications_created_at', ['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'type', type: 'varchar', length: 50 })
  type!: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId!: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'review_task_id', type: 'uuid', nullable: true })
  reviewTaskId!: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('User', 'notifications', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne('Lead', 'notifications', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead | null;

  @ManyToOne('Customer', 'notifications', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer | null;

  @ManyToOne('ReviewTask', 'notifications', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'review_task_id' })
  reviewTask?: ReviewTask | null;
}
