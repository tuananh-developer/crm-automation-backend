import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CommunicationDeliveryStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

@Entity('communication_deliveries')
@Index('UQ_communication_deliveries_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
export class CommunicationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status!: CommunicationDeliveryStatus;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId!: string | null;

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'retryable', type: 'boolean', default: false })
  retryable!: boolean;

  @Column({ name: 'simulated', type: 'boolean', default: false })
  simulated!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
