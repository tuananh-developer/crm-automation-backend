import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

export enum OutboxTransport {
  RABBITMQ = 'RABBITMQ',
  HTTP = 'HTTP',
}

@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 150 })
  eventType!: string;

  @Column({ name: 'exchange', type: 'varchar', length: 150, default: '' })
  exchange!: string;

  @Column({ name: 'routing_key', type: 'varchar', length: 150, default: '' })
  routingKey!: string;

  @Column({ name: 'transport', type: 'varchar', length: 20, default: OutboxTransport.RABBITMQ })
  transport!: OutboxTransport;

  /** Allowlisted configuration key, never an arbitrary URL supplied by clients. */
  @Column({ name: 'destination', type: 'varchar', length: 80, nullable: true })
  destination!: string | null;

  @Column({ name: 'destination_path', type: 'varchar', length: 255, nullable: true })
  destinationPath!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: OutboxEventStatus.PENDING,
  })
  status!: OutboxEventStatus;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'lock_token', type: 'uuid', nullable: true })
  lockToken!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
