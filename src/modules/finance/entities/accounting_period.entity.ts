import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('accounting_periods')
@Index(['companyId', 'code'], { unique: true })
export class AccountingPeriodEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ type: 'varchar', length: 64 })
  code!: string

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string

  @Column({ name: 'ends_on', type: 'date' })
  endsOn!: string

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status!: 'OPEN' | 'LOCKED' | 'CLOSED'

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
