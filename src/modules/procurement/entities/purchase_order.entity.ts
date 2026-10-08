import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm'
import type { ApprovalPipelineSnapshot } from '@platform/workflow/index.js'
import type { PurchaseOrderLineEntity } from './purchase_order_line.entity.js'

@Entity('purchase_orders')
@Index(['companyId', 'number'], { unique: true })
export class PurchaseOrderEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ name: 'supplier_id', type: 'varchar', length: 64 })
  supplierId!: string

  @Column({ type: 'varchar', length: 64 })
  number!: string

  @Column({ type: 'varchar', length: 16, default: 'DRAFT' })
  status!: 'DRAFT' | 'APPROVED' | 'CLOSED' | 'VOID'

  @Column({ name: 'approval_state', type: 'jsonb', nullable: true })
  approvalState!: ApprovalPipelineSnapshot | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany('PurchaseOrderLineEntity', (line: PurchaseOrderLineEntity) => line.purchaseOrder, {
    cascade: true,
  })
  lines!: PurchaseOrderLineEntity[]
}
