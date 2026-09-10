import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import type { PaymentVoucherEntity } from './payment_voucher.entity.js'

@Entity('payment_voucher_lines')
export class PaymentVoucherLineEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  paymentVoucherId!: string

  @Column('varchar', { length: 64 })
  invoiceId!: string

  @Column('varchar', { length: 64 })
  appliedAmountMinorUnits!: string

  @Column('text', { nullable: true })
  memo?: string

  @ManyToOne('PaymentVoucherEntity', (voucher: PaymentVoucherEntity) => voucher.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'paymentVoucherId' })
  paymentVoucher?: PaymentVoucherEntity
}
