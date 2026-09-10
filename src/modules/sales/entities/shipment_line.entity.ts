import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { ShipmentEntity } from './shipment.entity.js'

@Entity('sales_shipment_lines')
export class ShipmentLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'shipment_id', type: 'varchar', length: 64 })
  shipmentId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'shipped_quantity', type: 'bigint' })
  shippedQuantity!: string

  @Column({ name: 'unit_price_minor_units', type: 'bigint' })
  unitPriceMinorUnits!: string

  @Column({ name: 'line_total_minor_units', type: 'bigint' })
  lineTotalMinorUnits!: string

  @ManyToOne('ShipmentEntity', (s: ShipmentEntity) => s.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id' })
  shipment!: ShipmentEntity
}
