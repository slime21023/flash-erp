import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm'
import type { GoodsReceiptLineEntity } from './goods_receipt_line.entity.js'

@Entity('goods_receipts')
export class GoodsReceiptEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'purchase_order_id', type: 'varchar', length: 64 })
  purchaseOrderId!: string

  @Column({ name: 'warehouse_id', type: 'varchar', length: 64 })
  warehouseId!: string

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany('GoodsReceiptLineEntity', (line: GoodsReceiptLineEntity) => line.receipt, {
    cascade: true,
  })
  lines!: GoodsReceiptLineEntity[]
}
