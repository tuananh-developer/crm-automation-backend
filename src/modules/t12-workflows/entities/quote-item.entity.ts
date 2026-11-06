import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('quote_items')
@Index('IDX_quote_items_quote', ['quoteId'])
export class QuoteItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quote_id', type: 'uuid' })
  quoteId!: string;

  @Column({ name: 'catalog_item_id', type: 'uuid', nullable: true })
  catalogItemId!: string | null;

  @Column({ type: 'varchar', length: 80 })
  sku!: string;

  @Column({ name: 'name_snapshot', type: 'varchar', length: 200 })
  nameSnapshot!: string;

  @Column({ name: 'description_snapshot', type: 'text', nullable: true })
  descriptionSnapshot!: string | null;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({
    name: 'unit_price_snapshot',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  unitPriceSnapshot!: string;

  @Column({ name: 'tax_rate_percent', type: 'numeric', precision: 5, scale: 2 })
  taxRatePercent!: string;

  @Column({ name: 'line_subtotal', type: 'numeric', precision: 14, scale: 2 })
  lineSubtotal!: string;

  @Column({ name: 'line_discount', type: 'numeric', precision: 14, scale: 2 })
  lineDiscount!: string;

  @Column({ name: 'line_tax', type: 'numeric', precision: 14, scale: 2 })
  lineTax!: string;

  @Column({ name: 'line_total', type: 'numeric', precision: 14, scale: 2 })
  lineTotal!: string;
}
