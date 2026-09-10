import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { SalesOrderEntity } from './sales_order.entity.js'

@Entity('sales_order_lines')
export class SalesOrderLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'sales_order_id', type: 'varchar', length: 64 })
  salesOrderId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'warehouse_id', type: 'varchar', length: 64 })
  warehouseId!: string

  @Column({ name: 'ordered_quantity', type: 'bigint' })
  orderedQuantity!: string

  @Column({ name: 'shipped_quantity', type: 'bigint', default: '0' })
  shippedQuantity!: string

  @Column({ name: 'unit_price_minor_units', type: 'bigint' })
  unitPriceMinorUnits!: string

  @Column({ name: 'line_total_minor_units', type: 'bigint' })
  lineTotalMinorUnits!: string

  @Column({ type: 'varchar', length: 3 })
  currency!: string

  @ManyToOne('SalesOrderEntity', (so: SalesOrderEntity) => so.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrderEntity
}
