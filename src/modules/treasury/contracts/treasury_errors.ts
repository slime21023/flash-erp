import { DomainError } from '@platform/fp/index.js'

export class TreasuryError extends DomainError {
  readonly code = 'TREASURY_ERROR'
  constructor(message: string) {
    super(message)
  }
}

export class BankAccountAlreadyExistsError extends DomainError {
  readonly code = 'BANK_ACCOUNT_ALREADY_EXISTS'
  constructor(readonly accountNumber: string) {
    super(`Bank account already exists: ${accountNumber}`)
  }
}

export class BankAccountNotFoundError extends DomainError {
  readonly code = 'BANK_ACCOUNT_NOT_FOUND'
  constructor(readonly accountId: string) {
    super(`Bank account not found: ${accountId}`)
  }
}

export class PaymentNotFoundError extends DomainError {
  readonly code = 'PAYMENT_NOT_FOUND'
  constructor(readonly paymentId: string) {
    super(`Payment voucher not found: ${paymentId}`)
  }
}

export class ReceiptNotFoundError extends DomainError {
  readonly code = 'RECEIPT_NOT_FOUND'
  constructor(readonly receiptId: string) {
    super(`Receipt voucher not found: ${receiptId}`)
  }
}

export class InvalidPaymentStateError extends DomainError {
  readonly code = 'INVALID_PAYMENT_STATE'
  constructor(
    readonly currentStatus: string,
    readonly action: string
  ) {
    super(`Cannot perform ${action} on payment in status: ${currentStatus}`)
  }
}

export class InvalidReceiptStateError extends DomainError {
  readonly code = 'INVALID_RECEIPT_STATE'
  constructor(
    readonly currentStatus: string,
    readonly action: string
  ) {
    super(`Cannot perform ${action} on receipt in status: ${currentStatus}`)
  }
}

export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS'
  constructor(
    readonly accountId: string,
    readonly currentBalanceMinorUnits: bigint,
    readonly requestedAmountMinorUnits: bigint
  ) {
    super(
      `Insufficient funds in account ${accountId}: current balance ${currentBalanceMinorUnits}, requested ${requestedAmountMinorUnits}`
    )
  }
}

export class SettlementExceededError extends DomainError {
  readonly code = 'SETTLEMENT_EXCEEDED'
  constructor(readonly message: string) {
    super(message)
  }
}

export class BankStatementNotFoundError extends DomainError {
  readonly code = 'BANK_STATEMENT_NOT_FOUND'
  constructor(readonly statementId: string) {
    super(`Bank statement not found: ${statementId}`)
  }
}
