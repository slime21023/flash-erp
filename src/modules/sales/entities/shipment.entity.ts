import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm'
import type { ShipmentLineEntity } from './shipment_line.entity.js'

@Entity('sales_shipments')
export class ShipmentEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'sales_order_id', type: 'varchar', length: 64 })
  salesOrderId!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'customer_id', type: 'varchar', length: 64 })
  customerId!: string

  @Column({ name: 'warehouse_id', type: 'varchar', length: 64 })
  warehouseId!: string

  @Column({ name: 'shipment_date', type: 'varchar', length: 10 })
  shipmentDate!: string

  @Column({ type: 'varchar', length: 24, default: 'SHIPPED' })
  status!: 'SHIPPED'

  @Column({ name: 'ar_journal_entry_id', type: 'varchar', length: 64, nullable: true })
  arJournalEntryId?: string

  @Column({ name: 'cogs_journal_entry_id', type: 'varchar', length: 64, nullable: true })
  cogsJournalEntryId?: string

  @Column({ name: 'total_shipped_amount_minor_units', type: 'bigint' })
  totalShippedAmountMinorUnits!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany('ShipmentLineEntity', (line: ShipmentLineEntity) => line.shipment, { cascade: true })
  lines!: ShipmentLineEntity[]
}
