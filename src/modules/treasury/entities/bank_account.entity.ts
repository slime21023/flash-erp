import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('bank_accounts')
export class BankAccountEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  companyId!: string

  @Column('varchar', { length: 64 })
  accountNumber!: string

  @Column('varchar', { length: 32 })
  bankCode!: string

  @Column('varchar', { length: 128 })
  bankName!: string

  @Column('varchar', { length: 128 })
  accountName!: string

  @Column('varchar', { length: 8, default: 'TWD' })
  currency!: string

  @Column('varchar', { length: 64 })
  glAccountId!: string

  @Column('varchar', { length: 64, default: '0' })
  currentBalanceMinorUnits!: string

  @Column('boolean', { default: true })
  isActive!: boolean
}
