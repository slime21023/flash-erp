export class GoodsReceivedEvent {
  static readonly EVENT_NAME = 'procurement.goods_received'

  constructor(
    public readonly receiptId: string,
    public readonly purchaseOrderId: string,
    public readonly companyId: string,
    public readonly warehouseId: string,
    public readonly receivedAt: Date
  ) {}
}

export class PurchaseOrderApprovedEvent {
  static readonly EVENT_NAME = 'procurement.purchase_order_approved'

  constructor(
    public readonly purchaseOrderId: string,
    public readonly companyId: string,
    public readonly supplierId: string,
    public readonly approvedAt: Date
  ) {}
}

export class PurchaseRequisitionApprovedEvent {
  static readonly EVENT_NAME = 'procurement.purchase_requisition_approved'

  constructor(
    public readonly requisitionId: string,
    public readonly companyId: string,
    public readonly requesterId: string,
    public readonly approvedAt: Date
  ) {}
}

export class VendorInvoiceMatchedEvent {
  static readonly EVENT_NAME = 'procurement.vendor_invoice_matched'

  constructor(
    public readonly invoiceId: string,
    public readonly companyId: string,
    public readonly purchaseOrderId: string,
    public readonly matchedAt: Date
  ) {}
}

export class AccountsPayableVoucherCreatedEvent {
  static readonly EVENT_NAME = 'procurement.accounts_payable_voucher_created'

  constructor(
    public readonly invoiceId: string,
    public readonly journalEntryId: string,
    public readonly companyId: string,
    public readonly totalAmountMinorUnits: bigint,
    public readonly createdAt: Date
  ) {}
}
