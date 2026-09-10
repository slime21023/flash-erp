import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm'
import { InventoryItemEntity } from './inventory_item.entity.js'
import { InventoryWarehouseEntity } from './inventory_warehouse.entity.js'

@Entity('inventory_movements')
@Index(['sourceType', 'sourceId', 'itemId', 'warehouseId'], { unique: true })
export class InventoryMovementEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'warehouse_id', type: 'varchar', length: 64 })
  warehouseId!: string

  @Column({ name: 'source_type', type: 'varchar', length: 64 })
  sourceType!: string

  @Column({ name: 'source_id', type: 'varchar', length: 64 })
  sourceId!: string

  @Column({ name: 'quantity_delta', type: 'bigint' })
  quantityDelta!: string

  @Column({ name: 'unit_cost_minor_units', type: 'bigint' })
  unitCostMinorUnits!: string

  @Column({ type: 'varchar', length: 3 })
  currency!: string

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @ManyToOne(() => InventoryItemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item?: InventoryItemEntity

  @ManyToOne(() => InventoryWarehouseEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse?: InventoryWarehouseEntity
}
