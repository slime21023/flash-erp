export class WorkOrderReleasedEvent {
  static readonly EVENT_NAME = 'manufacturing.work_order_released'

  constructor(
    public readonly workOrderId: string,
    public readonly companyId: string,
    public readonly outputItemId: string,
    public readonly targetQuantity: bigint,
    public readonly releasedAt: Date
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
    public readonly issuedAt: Date
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
    public readonly completedAt: Date
  ) {}
}

export class OverheadAllocatedEvent {
  static readonly EVENT_NAME = 'manufacturing.overhead_allocated'

  constructor(
    public readonly companyId: string,
    public readonly totalOverheadAmountMinorUnits: bigint,
    public readonly workOrderCount: number,
    public readonly allocatedAt: Date
  ) {}
}
