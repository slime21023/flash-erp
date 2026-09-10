import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import type { ReceiptVoucherEntity } from './receipt_voucher.entity.js'

@Entity('receipt_voucher_lines')
export class ReceiptVoucherLineEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  receiptVoucherId!: string

  @Column('varchar', { length: 64 })
  referenceId!: string

  @Column('varchar', { length: 64 })
  appliedAmountMinorUnits!: string

  @Column('text', { nullable: true })
  memo?: string

  @ManyToOne('ReceiptVoucherEntity', (voucher: ReceiptVoucherEntity) => voucher.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'receiptVoucherId' })
  receiptVoucher?: ReceiptVoucherEntity
}
