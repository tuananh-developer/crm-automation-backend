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

@Entity('audit_logs')
@Index('IDX_audit_logs_entity', ['entityType', 'entityId'])
@Index('IDX_audit_logs_user_id', ['userId'])
@Index('IDX_audit_logs_action', ['action'])
@Index('IDX_audit_logs_created_at', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'action', type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: Record<string, any> | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: Record<string, any> | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('User', 'auditLogs', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;
}
