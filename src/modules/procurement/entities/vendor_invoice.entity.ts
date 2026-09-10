import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm'
import type { VendorInvoiceLineEntity } from './vendor_invoice_line.entity.js'

@Entity('procurement_vendor_invoices')
@Index(['companyId', 'invoiceNumber'], { unique: true })
export class VendorInvoiceEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'supplier_id', type: 'varchar', length: 64 })
  supplierId!: string

  @Column({ name: 'purchase_order_id', type: 'varchar', length: 64 })
  purchaseOrderId!: string

  @Column({ name: 'invoice_number', type: 'varchar', length: 64 })
  invoiceNumber!: string

  @Column({ name: 'invoice_date', type: 'varchar', length: 10 })
  invoiceDate!: string

  @Column({ type: 'varchar', length: 3 })
  currency!: string

  @Column({ name: 'tax_rate_basis_points', type: 'int', default: 500 })
  taxRateBasisPoints!: number

  @Column({ name: 'net_amount_minor_units', type: 'bigint' })
  netAmountMinorUnits!: string

  @Column({ name: 'tax_amount_minor_units', type: 'bigint' })
  taxAmountMinorUnits!: string

  @Column({ name: 'total_amount_minor_units', type: 'bigint' })
  totalAmountMinorUnits!: string

  @Column({ type: 'varchar', length: 24, default: 'RECEIVED' })
  status!: 'RECEIVED' | 'MATCHED' | 'POSTED' | 'DISPUTED' | 'VOID'

  @Column({ name: 'matched_at', type: 'timestamptz', nullable: true })
  matchedAt?: Date

  @Column({ name: 'journal_entry_id', type: 'varchar', length: 64, nullable: true })
  journalEntryId?: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany('VendorInvoiceLineEntity', (line: VendorInvoiceLineEntity) => line.invoice, {
    cascade: true,
  })
  lines!: VendorInvoiceLineEntity[]
}
