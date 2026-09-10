import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { SalesOrderConfirmedEvent, SalesOrderShippedEvent } from '@modules/sales/contracts/index.js'
import { AuditContract } from '../contracts/index.js'
import type { AuditEntryInput } from '../contracts/index.js'

@Injectable()
export class SalesAuditListener {
  constructor(private readonly audit: AuditContract) {}

  private async append(input: AuditEntryInput): Promise<void> {
    const result = await this.audit.append(input)
    if (result.isErr) throw result.error
  }

  @OnEvent(SalesOrderConfirmedEvent.EVENT_NAME, { suppressErrors: false })
  async handleSalesOrderConfirmed(event: SalesOrderConfirmedEvent) {
    await this.append({
      action: 'SALES_ORDER_CONFIRMED',
      entityType: 'SALES_ORDER',
      entityId: event.salesOrderId,
      afterValue: {
        companyId: event.companyId,
        customerId: event.customerId,
        totalAmountMinorUnits: event.totalAmountMinorUnits.toString(),
        confirmedAt: new Date(event.confirmedAt).toISOString(),
      },
    })
  }

  @OnEvent(SalesOrderShippedEvent.EVENT_NAME, { suppressErrors: false })
  async handleSalesOrderShipped(event: SalesOrderShippedEvent) {
    await this.append({
      action: 'SALES_ORDER_SHIPPED',
      entityType: 'SHIPMENT',
      entityId: event.shipmentId,
      afterValue: {
        salesOrderId: event.salesOrderId,
        companyId: event.companyId,
        customerId: event.customerId,
        totalShippedAmountMinorUnits: event.totalShippedAmountMinorUnits.toString(),
        shippedAt: new Date(event.shippedAt).toISOString(),
      },
    })
  }
}
