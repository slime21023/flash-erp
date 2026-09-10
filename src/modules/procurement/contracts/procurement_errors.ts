import { DomainError } from '@platform/fp/index.js'

export class ProcurementError extends DomainError {
  readonly code = 'PROCUREMENT_ERROR'
  constructor(message: string) {
    super(message)
  }
}

export class SupplierAlreadyExistsError extends DomainError {
  readonly code = 'SUPPLIER_ALREADY_EXISTS'
  constructor(readonly codeVal: string) {
    super(`Supplier already exists: ${codeVal}`)
  }
}

export class SupplierNotFoundError extends DomainError {
  readonly code = 'SUPPLIER_NOT_FOUND'
  constructor(readonly id: string) {
    super(`Supplier not found: ${id}`)
  }
}

export class PurchaseOrderNotFoundError extends DomainError {
  readonly code = 'PURCHASE_ORDER_NOT_FOUND'
  constructor(readonly id: string) {
    super(`Purchase order not found: ${id}`)
  }
}

export class InvalidPurchaseOrderStateError extends DomainError {
  readonly code = 'INVALID_PURCHASE_ORDER_STATE'
  constructor(
    readonly currentStatus: string,
    readonly action: string
  ) {
    super(`Cannot ${action} purchase order while status is ${currentStatus}`)
  }
}

export class PurchaseRequisitionNotFoundError extends DomainError {
  readonly code = 'PURCHASE_REQUISITION_NOT_FOUND'
  constructor(readonly id: string) {
    super(`Purchase requisition not found: ${id}`)
  }
}

export class InvalidPurchaseRequisitionStateError extends DomainError {
  readonly code = 'INVALID_PURCHASE_REQUISITION_STATE'
  constructor(
    readonly currentStatus: string,
    readonly action: string
  ) {
    super(`Cannot ${action} purchase requisition while status is ${currentStatus}`)
  }
}

export class VendorInvoiceNotFoundError extends DomainError {
  readonly code = 'VENDOR_INVOICE_NOT_FOUND'
  constructor(readonly id: string) {
    super(`Vendor invoice not found: ${id}`)
  }
}

export class VendorInvoiceAlreadyExistsError extends DomainError {
  readonly code = 'VENDOR_INVOICE_ALREADY_EXISTS'
  constructor(readonly invoiceNumber: string) {
    super(`Vendor invoice already exists: ${invoiceNumber}`)
  }
}

export class InvalidVendorInvoiceStateError extends DomainError {
  readonly code = 'INVALID_VENDOR_INVOICE_STATE'
  constructor(
    readonly currentStatus: string,
    readonly action: string
  ) {
    super(`Cannot ${action} vendor invoice while status is ${currentStatus}`)
  }
}

export type MatchingMismatchField = 'QUANTITY' | 'UNIT_PRICE' | 'TOTAL_AMOUNT' | 'ITEM_MISMATCH'

export class MatchingToleranceExceededError extends DomainError {
  readonly code = 'MATCHING_TOLERANCE_EXCEEDED'
  constructor(
    readonly details: Readonly<{
      invoiceId: string
      itemId?: string
      field: MatchingMismatchField
      expected: string
      actual: string
      tolerance: string
      message: string
    }>
  ) {
    super(`3-Way matching failed for invoice ${details.invoiceId}: ${details.message}`)
  }
}

export class AccountsPayablePostingError extends DomainError {
  readonly code = 'ACCOUNTS_PAYABLE_POSTING_ERROR'
  constructor(message: string) {
    super(`Failed to post accounts payable voucher: ${message}`)
  }
}
