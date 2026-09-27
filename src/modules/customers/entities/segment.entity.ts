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
import type { CustomerSegment } from './customer-segment.entity.js';

@Entity('segments')
@Index('IDX_segments_name', ['name'], { unique: true })
export class Segment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 150, unique: true })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'criteria', type: 'jsonb', nullable: true })
  criteria!: Record<string, any> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

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

  @OneToMany('CustomerSegment', 'segment')
  customerSegments?: CustomerSegment[];
}
