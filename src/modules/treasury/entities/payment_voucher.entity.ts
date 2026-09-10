import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm'
import type { PaymentVoucherLineEntity } from './payment_voucher_line.entity.js'

@Entity('payment_vouchers')
export class PaymentVoucherEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  companyId!: string

  @Column('varchar', { length: 64 })
  bankAccountId!: string

  @Column('varchar', { length: 64 })
  paymentNumber!: string

  @Column('varchar', { length: 32 })
  paymentDate!: string

  @Column('varchar', { length: 32 })
  beneficiaryType!: 'SUPPLIER' | 'OTHER'

  @Column('varchar', { length: 64 })
  beneficiaryId!: string

  @Column('varchar', { length: 8, default: 'TWD' })
  currency!: string

  @Column('varchar', { length: 64 })
  amountMinorUnits!: string

  @Column('varchar', { length: 32, default: 'DRAFT' })
  status!: 'DRAFT' | 'POSTED' | 'CANCELLED'

  @Column('varchar', { length: 64, nullable: true })
  journalEntryId?: string

  @Column('text', { nullable: true })
  memo?: string

  @Column('timestamptz', { nullable: true })
  postedAt?: Date

  @OneToMany('PaymentVoucherLineEntity', (line: PaymentVoucherLineEntity) => line.paymentVoucher, {
    cascade: true,
  })
  lines!: PaymentVoucherLineEntity[]
}
