import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm'
import type { SalesOrderLineEntity } from './sales_order_line.entity.js'

@Entity('sales_orders')
@Index(['companyId', 'number'], { unique: true })
export class SalesOrderEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'customer_id', type: 'varchar', length: 64 })
  customerId!: string

  @Column({ type: 'varchar', length: 64 })
  number!: string

  @Column({ type: 'varchar', length: 24, default: 'DRAFT' })
  status!: 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CLOSED' | 'VOID'

  @Column({ name: 'tax_rate_basis_points', type: 'int', default: 500 })
  taxRateBasisPoints!: number

  @Column({ name: 'net_amount_minor_units', type: 'bigint' })
  netAmountMinorUnits!: string

  @Column({ name: 'tax_amount_minor_units', type: 'bigint' })
  taxAmountMinorUnits!: string

  @Column({ name: 'total_amount_minor_units', type: 'bigint' })
  totalAmountMinorUnits!: string

  @Column({ name: 'reservation_ids', type: 'simple-json', nullable: true })
  reservationIds?: string[]

  @Column({ type: 'varchar', length: 255, nullable: true })
  memo?: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany('SalesOrderLineEntity', (line: SalesOrderLineEntity) => line.salesOrder, {
    cascade: true,
  })
  lines!: SalesOrderLineEntity[]
}
