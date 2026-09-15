import { currentEventMetadata } from '@platform/context/index.js'
import type { EventMetadata } from '@platform/context/index.js'

export class SalesOrderConfirmedEvent {
  static readonly EVENT_NAME = 'sales.order_confirmed'

  constructor(
    public readonly salesOrderId: string,
    public readonly companyId: string,
    public readonly customerId: string,
    public readonly totalAmountMinorUnits: bigint,
    public readonly confirmedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}

export class SalesOrderShippedEvent {
  static readonly EVENT_NAME = 'sales.order_shipped'

  constructor(
    public readonly shipmentId: string,
    public readonly salesOrderId: string,
    public readonly companyId: string,
    public readonly customerId: string,
    public readonly totalShippedAmountMinorUnits: bigint,
    public readonly shippedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}
