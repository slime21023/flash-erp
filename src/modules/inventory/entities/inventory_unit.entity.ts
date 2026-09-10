import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('inventory_units')
export class InventoryUnitEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code!: string

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
