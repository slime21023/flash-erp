import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { NormalBalance } from '../contracts/account_contract.js'

@Entity('accounts')
@Index(['companyId', 'code'], { unique: true })
export class AccountEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ type: 'varchar', length: 64 })
  code!: string

  @Column({ type: 'varchar', length: 160 })
  name!: string

  @Column({ name: 'normal_balance', type: 'varchar', length: 8 })
  normalBalance!: NormalBalance

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
