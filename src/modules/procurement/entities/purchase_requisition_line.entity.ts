import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { PurchaseRequisitionEntity } from './purchase_requisition.entity.js'

@Entity('procurement_purchase_requisition_lines')
export class PurchaseRequisitionLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'requisition_id', type: 'varchar', length: 64 })
  requisitionId!: string

  @Column({ name: 'item_id', type: 'varchar', length: 64 })
  itemId!: string

  @Column({ name: 'requested_quantity', type: 'bigint' })
  requestedQuantity!: string

  @Column({ name: 'estimated_cost_minor_units', type: 'bigint' })
  estimatedCostMinorUnits!: string

  @Column({ type: 'varchar', length: 3 })
  currency!: string

  @ManyToOne('PurchaseRequisitionEntity', (req: PurchaseRequisitionEntity) => req.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'requisition_id' })
  requisition!: PurchaseRequisitionEntity
}
