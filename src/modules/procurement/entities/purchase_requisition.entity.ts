import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm'
import type { PurchaseRequisitionLineEntity } from './purchase_requisition_line.entity.js'

@Entity('procurement_purchase_requisitions')
@Index(['companyId', 'number'], { unique: true })
export class PurchaseRequisitionEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'requester_id', type: 'varchar', length: 64 })
  requesterId!: string

  @Column({ type: 'varchar', length: 64 })
  number!: string

  @Column({ type: 'varchar', length: 24, default: 'DRAFT' })
  status!: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED'

  @Column({ type: 'varchar', length: 255, nullable: true })
  memo?: string

  @Column({ name: 'converted_purchase_order_id', type: 'varchar', length: 64, nullable: true })
  convertedPurchaseOrderId?: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany(
    'PurchaseRequisitionLineEntity',
    (line: PurchaseRequisitionLineEntity) => line.requisition,
    { cascade: true }
  )
  lines!: PurchaseRequisitionLineEntity[]
}
