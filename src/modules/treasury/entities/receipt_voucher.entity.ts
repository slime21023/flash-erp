import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm'
import type { ReceiptVoucherLineEntity } from './receipt_voucher_line.entity.js'

@Entity('receipt_vouchers')
export class ReceiptVoucherEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  companyId!: string

  @Column('varchar', { length: 64 })
  bankAccountId!: string

  @Column('varchar', { length: 64 })
  receiptNumber!: string

  @Column('varchar', { length: 32 })
  receiptDate!: string

  @Column('varchar', { length: 32 })
  payerType!: 'CUSTOMER' | 'OTHER'

  @Column('varchar', { length: 64 })
  payerId!: string

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

  @OneToMany('ReceiptVoucherLineEntity', (line: ReceiptVoucherLineEntity) => line.receiptVoucher, {
    cascade: true,
  })
  lines!: ReceiptVoucherLineEntity[]
}
