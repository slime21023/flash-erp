import { currentEventMetadata } from '@platform/context/index.js'
import type { EventMetadata } from '@platform/context/index.js'

export class PaymentProcessedEvent {
  static readonly EVENT_NAME = 'treasury.payment_processed'

  constructor(
    public readonly paymentId: string,
    public readonly companyId: string,
    public readonly bankAccountId: string,
    public readonly beneficiaryId: string,
    public readonly amountMinorUnits: bigint,
    public readonly currency: string,
    public readonly processedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}

export class ReceiptProcessedEvent {
  static readonly EVENT_NAME = 'treasury.receipt_processed'

  constructor(
    public readonly receiptId: string,
    public readonly companyId: string,
    public readonly bankAccountId: string,
    public readonly payerId: string,
    public readonly amountMinorUnits: bigint,
    public readonly currency: string,
    public readonly processedAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}

export class BankStatementReconciledEvent {
  static readonly EVENT_NAME = 'treasury.bank_statement_reconciled'

  constructor(
    public readonly statementId: string,
    public readonly bankAccountId: string,
    public readonly matchedCount: number,
    public readonly unmatchedCount: number,
    public readonly isBalanced: boolean,
    public readonly reconciledAt: Date,
    public readonly eventMetadata: EventMetadata = currentEventMetadata()
  ) {}
}
