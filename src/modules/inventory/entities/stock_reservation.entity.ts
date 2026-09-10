import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm'

@Entity('inventory_stock_reservations')
export class StockReservationEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'warehouse_id', type: 'varchar', length: 64 })
  warehouseId!: string

  @Column({ type: 'bigint' })
  quantity!: string

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status!: 'ACTIVE' | 'RELEASED' | 'FULFILLED'

  @Column({ name: 'reference_type', type: 'varchar', length: 32 })
  referenceType!: string

  @Column({ name: 'reference_id', type: 'varchar', length: 64 })
  referenceId!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
