import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  BankStatementReconciledEvent,
  PaymentProcessedEvent,
  ReceiptProcessedEvent,
} from '@modules/treasury/contracts/index.js'
import { AuditContract } from '../contracts/index.js'
import type { AuditEntryInput } from '../contracts/index.js'

@Injectable()
export class TreasuryAuditListener {
  constructor(private readonly audit: AuditContract) {}

  private async append(input: AuditEntryInput): Promise<void> {
    const result = await this.audit.append(input)
    if (result.isErr) throw result.error
  }

  @OnEvent(PaymentProcessedEvent.EVENT_NAME, { suppressErrors: false })
  async handlePaymentProcessed(event: PaymentProcessedEvent) {
    await this.append({
      action: 'PAYMENT_PROCESSED',
      entityType: 'PAYMENT_VOUCHER',
      entityId: event.paymentId,
      afterValue: {
        companyId: event.companyId,
        bankAccountId: event.bankAccountId,
        beneficiaryId: event.beneficiaryId,
        amountMinorUnits: event.amountMinorUnits.toString(),
        currency: event.currency,
        processedAt: new Date(event.processedAt).toISOString(),
      },
    })
  }

  @OnEvent(ReceiptProcessedEvent.EVENT_NAME, { suppressErrors: false })
  async handleReceiptProcessed(event: ReceiptProcessedEvent) {
    await this.append({
      action: 'RECEIPT_PROCESSED',
      entityType: 'RECEIPT_VOUCHER',
      entityId: event.receiptId,
      afterValue: {
        companyId: event.companyId,
        bankAccountId: event.bankAccountId,
        payerId: event.payerId,
        amountMinorUnits: event.amountMinorUnits.toString(),
        currency: event.currency,
        processedAt: new Date(event.processedAt).toISOString(),
      },
    })
  }

  @OnEvent(BankStatementReconciledEvent.EVENT_NAME, { suppressErrors: false })
  async handleBankStatementReconciled(event: BankStatementReconciledEvent) {
    await this.append({
      action: 'BANK_STATEMENT_RECONCILED',
      entityType: 'BANK_STATEMENT',
      entityId: event.statementId,
      afterValue: {
        bankAccountId: event.bankAccountId,
        matchedCount: event.matchedCount,
        unmatchedCount: event.unmatchedCount,
        isBalanced: event.isBalanced,
        reconciledAt: new Date(event.reconciledAt).toISOString(),
      },
    })
  }
}
