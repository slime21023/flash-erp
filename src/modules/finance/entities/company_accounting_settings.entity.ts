import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('company_accounting_settings')
export class CompanyAccountingSettingsEntity {
  @PrimaryColumn({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'base_currency', type: 'varchar', length: 3 })
  baseCurrency!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
