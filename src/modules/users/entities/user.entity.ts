import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole, UserStatus } from '../enums/user.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { Notification } from '../../notifications/entities/notification.entity.js';
import type { ReviewTask } from '../../review/entities/review-task.entity.js';
import type { FollowUpSequence } from '../../follow-up/entities/follow-up-sequence.entity.js';
import type { Customer } from '../../customers/entities/customer.entity.js';
import type { AuditLog } from '../../audit/entities/audit-log.entity.js';

@Entity('users')
@Index('IDX_users_email', ['email'], { unique: true })
@Index('IDX_users_role', ['role'])
@Index('IDX_users_status', ['status'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'email', type: 'varchar', length: 320, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({
    name: 'role',
    type: 'varchar',
    length: 30,
    default: UserRole.SALES,
  })
  role!: UserRole;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany('Lead', 'owner')
  leads?: Lead[];

  @OneToMany('FollowUpSequence', 'creator')
  createdSequences?: FollowUpSequence[];

  @OneToMany('Customer', 'creator')
  createdCustomers?: Customer[];

  @OneToMany('ReviewTask', 'assignee')
  reviewTasks?: ReviewTask[];

  @OneToMany('Notification', 'user')
  notifications?: Notification[];

  @OneToMany('AuditLog', 'user')
  auditLogs?: AuditLog[];
}
