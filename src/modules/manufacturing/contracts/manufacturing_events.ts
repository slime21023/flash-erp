import { currentEventMetadata } from '@platform/context/index.js'
import type { EventMetadata } from '@platform/context/index.js'

export class WorkOrderReleasedEvent {
  static readonly EVENT_NAME = 'manufacturing.work_order_released'

  constructor(
    public readonly workOrderId: string,
    public readonly companyId: string,
    public readonly outputItemId: string,
    public readonly targetQuantity: bigint,
    public readonly releasedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}

export class MaterialIssuedEvent {
  static readonly EVENT_NAME = 'manufacturing.material_issued'

  constructor(
    public readonly workOrderId: string,
    public readonly companyId: string,
    public readonly componentItemId: string,
    public readonly quantity: bigint,
    public readonly costMinorUnits: bigint,
    public readonly issuedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}

export class WorkOrderCompletedEvent {
  static readonly EVENT_NAME = 'manufacturing.work_order_completed'

  constructor(
    public readonly workOrderId: string,
    public readonly companyId: string,
    public readonly outputItemId: string,
    public readonly completedQuantity: bigint,
    public readonly totalCostMinorUnits: bigint,
    public readonly unitCostMinorUnits: bigint,
    public readonly completedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}

export class OverheadAllocatedEvent {
  static readonly EVENT_NAME = 'manufacturing.overhead_allocated'

  constructor(
    public readonly companyId: string,
    public readonly totalOverheadAmountMinorUnits: bigint,
    public readonly workOrderCount: number,
    public readonly allocatedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}
