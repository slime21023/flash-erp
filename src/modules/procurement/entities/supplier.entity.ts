import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('suppliers')
@Index(['companyId', 'code'], { unique: true })
export class SupplierEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ type: 'varchar', length: 64 })
  code!: string

  @Column({ type: 'varchar', length: 160 })
  name!: string

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
