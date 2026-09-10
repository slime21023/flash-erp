import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { GoodsReceiptEntity } from './goods_receipt.entity.js'

@Entity('procurement_goods_receipt_lines')
export class GoodsReceiptLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'receipt_id', type: 'varchar', length: 64 })
  receiptId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'received_quantity', type: 'bigint' })
  receivedQuantity!: string

  @ManyToOne('GoodsReceiptEntity', (rcpt: GoodsReceiptEntity) => rcpt.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'receipt_id' })
  receipt!: GoodsReceiptEntity
}
