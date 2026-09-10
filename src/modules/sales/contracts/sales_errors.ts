import { DomainError } from '@platform/fp/index.js'

export class SalesError extends DomainError {
  readonly code = 'SALES_ERROR'
  constructor(message: string) {
    super(message)
  }
}

export class CustomerNotFoundError extends DomainError {
  readonly code = 'CUSTOMER_NOT_FOUND'
  constructor(readonly id: string) {
    super(`Customer not found: ${id}`)
  }
}

export class CustomerAlreadyExistsError extends DomainError {
  readonly code = 'CUSTOMER_ALREADY_EXISTS'
  constructor(readonly codeVal: string) {
    super(`Customer already exists: ${codeVal}`)
  }
}

export class CreditLimitExceededError extends DomainError {
  readonly code = 'CREDIT_LIMIT_EXCEEDED'
  constructor(
    readonly details: Readonly<{
      customerId: string
      creditLimitMinorUnits: bigint
      currentOutstandingMinorUnits: bigint
      pendingOrdersMinorUnits: bigint
      requestedOrderAmountMinorUnits: bigint
      excessMinorUnits: bigint
    }>
  ) {
    super(
      `Credit limit exceeded for customer ${details.customerId}: limit ${details.creditLimitMinorUnits}, total exposure ${
        details.currentOutstandingMinorUnits +
        details.pendingOrdersMinorUnits +
        details.requestedOrderAmountMinorUnits
      } (excess: ${details.excessMinorUnits})`
    )
  }
}

export class SalesOrderNotFoundError extends DomainError {
  readonly code = 'SALES_ORDER_NOT_FOUND'
  constructor(readonly id: string) {
    super(`Sales order not found: ${id}`)
  }
}

export class InvalidSalesOrderStateError extends DomainError {
  readonly code = 'INVALID_SALES_ORDER_STATE'
  constructor(
    readonly currentStatus: string,
    readonly action: string
  ) {
    super(`Cannot ${action} sales order while status is ${currentStatus}`)
  }
}

export class ShipmentError extends DomainError {
  readonly code = 'SHIPMENT_ERROR'
  constructor(message: string) {
    super(`Shipment failed: ${message}`)
  }
}

export class AccountsReceivablePostingError extends DomainError {
  readonly code = 'ACCOUNTS_RECEIVABLE_POSTING_ERROR'
  constructor(message: string) {
    super(`Failed to post accounts receivable or COGS journal entry: ${message}`)
  }
}
