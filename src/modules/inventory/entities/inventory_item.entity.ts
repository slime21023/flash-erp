import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'
import { InventoryUnitEntity } from './inventory_unit.entity.js'

@Entity('inventory_items')
@Index(['companyId', 'sku'], { unique: true })
export class InventoryItemEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ type: 'varchar', length: 64 })
  sku!: string

  @Column({ type: 'varchar', length: 160 })
  name!: string

  @Column({ name: 'unit_id', type: 'varchar', length: 64 })
  unitId!: string

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  @ManyToOne(() => InventoryUnitEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit?: InventoryUnitEntity

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
