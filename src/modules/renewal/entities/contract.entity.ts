import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Customer } from '../../customers/entities/customer.entity.js';

@Entity('contracts')
@Index('IDX_contracts_customer_id', ['customerId'])
@Index('IDX_contracts_status', ['status'])
@Index('IDX_contracts_renewal_date', ['renewalDate'])
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'contract_number', type: 'varchar', length: 100 })
  contractNumber!: string;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'ACTIVE' })
  status!: string;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate!: Date;

  @Column({ name: 'renewal_date', type: 'timestamptz', nullable: true })
  renewalDate!: Date | null;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  amount!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('Customer', 'contracts', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;
}
