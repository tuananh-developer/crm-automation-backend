import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SegmentAssignmentType } from '../enums/customer.enum.js';
import type { Customer } from './customer.entity.js';
import type { Segment } from './segment.entity.js';
import type { User } from '../../users/entities/user.entity.js';

@Entity('customer_segments')
export class CustomerSegment {
  @PrimaryColumn({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @PrimaryColumn({ name: 'segment_id', type: 'uuid' })
  segmentId!: string;

  @Column({
    name: 'assignment_type',
    type: 'varchar',
    length: 30,
  })
  assignmentType!: SegmentAssignmentType;

  @Column({
    name: 'confidence',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidence!: number | null;

  @Column({ name: 'assigned_reason', type: 'text', nullable: true })
  assignedReason!: string | null;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy!: string | null;

  @ManyToOne('Customer', 'customerSegments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @ManyToOne('Segment', 'customerSegments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'segment_id' })
  segment?: Segment;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by' })
  assignedByUser?: User | null;
}
