import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('sales_customers')
@Index(['companyId', 'code'], { unique: true })
export class CustomerEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ type: 'varchar', length: 64 })
  code!: string

  @Column({ type: 'varchar', length: 128 })
  name!: string

  @Column({ name: 'payment_terms', type: 'varchar', length: 32, default: 'NET30' })
  paymentTerms!: string

  @Column({ type: 'varchar', length: 3, default: 'TWD' })
  currency!: string

  @Column({ name: 'credit_limit_minor_units', type: 'bigint' })
  creditLimitMinorUnits!: string

  @Column({ name: 'current_outstanding_minor_units', type: 'bigint', default: '0' })
  currentOutstandingMinorUnits!: string

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
