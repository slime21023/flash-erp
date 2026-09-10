import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm'
import type { WorkOrderLineEntity } from './work_order_line.entity.js'

@Entity('work_orders')
export class WorkOrderEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  companyId!: string

  @Column('varchar', { length: 64 })
  workOrderNumber!: string

  @Column('varchar', { length: 64 })
  bomId!: string

  @Column('varchar', { length: 64 })
  outputItemId!: string

  @Column('varchar', { length: 64 })
  outputWarehouseId!: string

  @Column('varchar', { length: 64 })
  rawMaterialWarehouseId!: string

  @Column('varchar', { length: 64 })
  targetQuantity!: string

  @Column('varchar', { length: 64, default: '0' })
  completedQuantity!: string

  @Column('varchar', { length: 32, default: 'DRAFT' })
  status!: 'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED'

  @Column('varchar', { length: 64, default: '0' })
  actualDirectMaterialCostMinorUnits!: string

  @Column('varchar', { length: 64, default: '0' })
  allocatedOverheadCostMinorUnits!: string

  @Column('varchar', { length: 64, default: '0' })
  totalCostMinorUnits!: string

  @Column('varchar', { length: 64, default: '0' })
  unitCostMinorUnits!: string

  @Column('text', { nullable: true })
  memo?: string

  @Column('timestamptz', { nullable: true })
  completedAt?: Date

  @OneToMany('WorkOrderLineEntity', (line: WorkOrderLineEntity) => line.workOrder, {
    cascade: true,
  })
  lines!: WorkOrderLineEntity[]
}
