import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Lead } from './lead.entity.js';
import type { User } from '../../users/entities/user.entity.js';

@Entity('interactions')
@Index('IDX_interactions_lead_id_occurred_at', ['leadId', 'occurredAt'])
export class Interaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @Column({ name: 'type', type: 'varchar', length: 50 })
  type!: string;

  @Column({ name: 'channel', type: 'varchar', length: 50, nullable: true })
  channel!: string | null;

  @Column({ name: 'subject', type: 'varchar', length: 255, nullable: true })
  subject!: string | null;

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('Lead', 'interactions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User | null;
}
