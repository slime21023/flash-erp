import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { VendorInvoiceEntity } from './vendor_invoice.entity.js'

@Entity('procurement_vendor_invoice_lines')
export class VendorInvoiceLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'invoice_id', type: 'varchar', length: 64 })
  invoiceId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'invoiced_quantity', type: 'bigint' })
  invoicedQuantity!: string

  @Column({ name: 'unit_price_minor_units', type: 'bigint' })
  unitPriceMinorUnits!: string

  @Column({ name: 'line_total_minor_units', type: 'bigint' })
  lineTotalMinorUnits!: string

  @ManyToOne('VendorInvoiceEntity', (inv: VendorInvoiceEntity) => inv.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: VendorInvoiceEntity
}
