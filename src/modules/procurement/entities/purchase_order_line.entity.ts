import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { PurchaseOrderEntity } from './purchase_order.entity.js'

@Entity('purchase_order_lines')
@Index(['purchaseOrderId', 'itemId'], { unique: true })
export class PurchaseOrderLineEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string

  @Column({ name: 'purchase_order_id', type: 'varchar', length: 64 })
  purchaseOrderId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'ordered_quantity', type: 'bigint' })
  orderedQuantity!: string

  @Column({ name: 'unit_cost_minor_units', type: 'bigint' })
  unitCostMinorUnits!: string

  @Column({ type: 'varchar', length: 3 })
  currency!: string

  @ManyToOne('PurchaseOrderEntity', (po: PurchaseOrderEntity) => po.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder?: PurchaseOrderEntity
}
