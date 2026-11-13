import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CommunicationDeliveryStatus {
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  RETRYABLE_FAILURE = 'RETRYABLE_FAILURE',
  PERMANENT_FAILURE = 'PERMANENT_FAILURE',
  UNKNOWN = 'UNKNOWN',
}

@Entity('communication_deliveries')
@Index('UQ_communication_deliveries_execution_id', ['executionId'], {
  unique: true,
})
@Index('UQ_communication_deliveries_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
@Index('IDX_communication_deliveries_status_started_at', ['status', 'startedAt'])
@Check(
  'CHK_communication_deliveries_status',
  '"status" IN (\'PROCESSING\', \'SENT\', \'RETRYABLE_FAILURE\', \'PERMANENT_FAILURE\', \'UNKNOWN\')',
)
@Check('CHK_communication_deliveries_attempts', '"attempts" >= 1')
export class CommunicationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'execution_id', type: 'uuid' })
  executionId!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 24,
    default: CommunicationDeliveryStatus.PROCESSING,
  })
  status!: CommunicationDeliveryStatus;

  @Column({ name: 'attempts', type: 'integer', default: 1 })
  attempts!: number;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId!: string | null;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
