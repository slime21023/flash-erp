import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  MaterialIssuedEvent,
  OverheadAllocatedEvent,
  WorkOrderCompletedEvent,
  WorkOrderReleasedEvent,
} from '@modules/manufacturing/contracts/index.js'
import { AuditContract } from '../contracts/index.js'
import type { AuditEntryInput } from '../contracts/index.js'

@Injectable()
export class ManufacturingAuditListener {
  constructor(private readonly audit: AuditContract) {}

  private async append(input: AuditEntryInput): Promise<void> {
    const result = await this.audit.append(input)
    if (result.isErr) throw result.error
  }

  @OnEvent(WorkOrderReleasedEvent.EVENT_NAME, { suppressErrors: false })
  async handleWorkOrderReleased(event: WorkOrderReleasedEvent) {
    await this.append({
      action: 'WORK_ORDER_RELEASED',
      entityType: 'WORK_ORDER',
      entityId: event.workOrderId,
      afterValue: {
        companyId: event.companyId,
        outputItemId: event.outputItemId,
        targetQuantity: event.targetQuantity.toString(),
        releasedAt: new Date(event.releasedAt).toISOString(),
      },
    })
  }

  @OnEvent(MaterialIssuedEvent.EVENT_NAME, { suppressErrors: false })
  async handleMaterialIssued(event: MaterialIssuedEvent) {
    await this.append({
      action: 'MATERIAL_ISSUED',
      entityType: 'WORK_ORDER',
      entityId: event.workOrderId,
      afterValue: {
        companyId: event.companyId,
        componentItemId: event.componentItemId,
        quantity: event.quantity.toString(),
        costMinorUnits: event.costMinorUnits.toString(),
        issuedAt: new Date(event.issuedAt).toISOString(),
      },
    })
  }

  @OnEvent(WorkOrderCompletedEvent.EVENT_NAME, { suppressErrors: false })
  async handleWorkOrderCompleted(event: WorkOrderCompletedEvent) {
    await this.append({
      action: 'WORK_ORDER_COMPLETED',
      entityType: 'WORK_ORDER',
      entityId: event.workOrderId,
      afterValue: {
        companyId: event.companyId,
        outputItemId: event.outputItemId,
        completedQuantity: event.completedQuantity.toString(),
        totalCostMinorUnits: event.totalCostMinorUnits.toString(),
        unitCostMinorUnits: event.unitCostMinorUnits.toString(),
        completedAt: new Date(event.completedAt).toISOString(),
      },
    })
  }

  @OnEvent(OverheadAllocatedEvent.EVENT_NAME, { suppressErrors: false })
  async handleOverheadAllocated(event: OverheadAllocatedEvent) {
    await this.append({
      action: 'OVERHEAD_ALLOCATED',
      entityType: 'COMPANY',
      entityId: event.companyId,
      afterValue: {
        totalOverheadAmountMinorUnits: event.totalOverheadAmountMinorUnits.toString(),
        workOrderCount: event.workOrderCount,
        allocatedAt: new Date(event.allocatedAt).toISOString(),
      },
    })
  }
}
