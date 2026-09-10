import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import type { WorkOrderEntity } from './work_order.entity.js'

@Entity('work_order_lines')
export class WorkOrderLineEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  workOrderId!: string

  @Column('varchar', { length: 64 })
  componentItemId!: string

  @Column('varchar', { length: 64 })
  warehouseId!: string

  @Column('varchar', { length: 64 })
  plannedQuantity!: string

  @Column('varchar', { length: 64, default: '0' })
  issuedQuantity!: string

  @ManyToOne('WorkOrderEntity', (wo: WorkOrderEntity) => wo.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workOrderId' })
  workOrder?: WorkOrderEntity
}
