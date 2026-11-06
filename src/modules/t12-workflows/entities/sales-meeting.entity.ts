import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sales_meetings')
@Index('UQ_sales_meetings_workflow_run', ['workflowRunId'], { unique: true })
@Index('IDX_sales_meetings_owner_scheduled', ['ownerId', 'scheduledAt'])
export class SalesMeeting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workflow_run_id', type: 'uuid', unique: true })
  workflowRunId!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId!: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'attendee_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  attendeeIds!: string[];

  @Column({
    name: 'meeting_purpose',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  meetingPurpose!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({
    name: 'source_type',
    type: 'varchar',
    length: 40,
    default: 'MEETING_TRANSCRIPT',
  })
  sourceType!: string;

  @Column({ type: 'varchar', length: 30, default: 'PROCESSING' })
  status!: 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @Column({ name: 'transcript_id', type: 'uuid', nullable: true })
  transcriptId!: string | null;

  @Column({ name: 'summary_id', type: 'uuid', nullable: true })
  summaryId!: string | null;

  @Column({ name: 'notification_sent_at', type: 'timestamptz', nullable: true })
  notificationSentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
