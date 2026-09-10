import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import type { FinanceContract, JournalLine } from '@modules/finance/contracts/index.js'
import type { EventEmitter2 } from '@nestjs/event-emitter'
import {
  BankAccountAlreadyExistsError,
  BankAccountNotFoundError,
  BankStatementNotFoundError,
  BankStatementReconciledEvent,
  InsufficientFundsError,
  InvalidPaymentStateError,
  InvalidReceiptStateError,
  PaymentNotFoundError,
  PaymentProcessedEvent,
  ReceiptNotFoundError,
  ReceiptProcessedEvent,
  TreasuryContract,
  TreasuryError,
  type BankAccountSnapshot,
  type BankReconciliationResult,
  type BankStatementLineSnapshot,
  type BankStatementSnapshot,
  type CreatePaymentInput,
  type CreateReceiptInput,
  type ImportBankStatementInput,
  type PaymentVoucherSnapshot,
  type ReceiptVoucherSnapshot,
  type RegisterBankAccountInput,
} from '../contracts/index.js'
import { BankReconciliationMatcher } from './bank_reconciliation_matcher.js'

export class InMemoryTreasuryService extends TreasuryContract {
  readonly #bankAccounts = new Map<string, BankAccountSnapshot>()
  readonly #payments = new Map<string, PaymentVoucherSnapshot>()
  readonly #receipts = new Map<string, ReceiptVoucherSnapshot>()
  readonly #bankStatements = new Map<string, BankStatementSnapshot>()

  constructor(
    private readonly finance?: FinanceContract,
    private readonly eventEmitter?: EventEmitter2
  ) {
    super()
  }

  async registerBankAccount(
    input: RegisterBankAccountInput,
    _options?: TransactionOptions
  ): Promise<Result<BankAccountSnapshot, TreasuryError | BankAccountAlreadyExistsError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const accountNumber = input.accountNumber.trim()
    const bankCode = input.bankCode.trim()
    const bankName = input.bankName.trim()
    const accountName = input.accountName.trim()
    const glAccountId = input.glAccountId.trim()

    if (
      !id ||
      !companyId ||
      !accountNumber ||
      !bankCode ||
      !bankName ||
      !accountName ||
      !glAccountId
    ) {
      return err(new TreasuryError('All bank account fields are required'))
    }

    if (
      this.#bankAccounts.has(id) ||
      [...this.#bankAccounts.values()].some(
        (b) => b.companyId === companyId && b.accountNumber === accountNumber
      )
    ) {
      return err(new BankAccountAlreadyExistsError(accountNumber))
    }

    const account: BankAccountSnapshot = Object.freeze({
      id,
      companyId,
      accountNumber,
      bankCode,
      bankName,
      accountName,
      currency: input.currency || 'TWD',
      glAccountId,
      currentBalanceMinorUnits: input.initialBalanceMinorUnits ?? 0n,
      isActive: true,
    })

    this.#bankAccounts.set(id, account)
    return ok(account)
  }

  async getBankAccount(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<BankAccountSnapshot, BankAccountNotFoundError>> {
    const account = this.#bankAccounts.get(id)
    if (!account) {
      return err(new BankAccountNotFoundError(id))
    }
    return ok(account)
  }

  async listBankAccounts(
    companyId: string,
    _options?: TransactionOptions
  ): Promise<Result<readonly BankAccountSnapshot[], TreasuryError>> {
    const list = [...this.#bankAccounts.values()].filter((b) => b.companyId === companyId)
    return ok(Object.freeze(list))
  }

  async createPayment(
    input: CreatePaymentInput,
    _options?: TransactionOptions
  ): Promise<Result<PaymentVoucherSnapshot, TreasuryError | BankAccountNotFoundError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const bankAccountId = input.bankAccountId.trim()
    const paymentNumber = input.paymentNumber.trim()
    const paymentDate = input.paymentDate.trim()
    const beneficiaryId = input.beneficiaryId.trim()

    if (!id || !companyId || !bankAccountId || !paymentNumber || !paymentDate || !beneficiaryId) {
      return err(
        new TreasuryError(
          'Payment id, bankAccountId, paymentNumber, date, and beneficiary are required'
        )
      )
    }

    if (input.amountMinorUnits <= 0n) {
      return err(new TreasuryError('Payment amount must be greater than zero'))
    }

    const bankAccount = this.#bankAccounts.get(bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(bankAccountId))
    }

    const lines = (input.lines ?? []).map((l) =>
      Object.freeze({
        invoiceId: l.invoiceId,
        appliedAmountMinorUnits: l.appliedAmountMinorUnits,
        memo: l.memo,
      })
    )

    const payment: PaymentVoucherSnapshot = Object.freeze({
      id,
      companyId,
      bankAccountId,
      paymentNumber,
      paymentDate,
      beneficiaryType: input.beneficiaryType,
      beneficiaryId,
      currency: input.currency || bankAccount.currency,
      amountMinorUnits: input.amountMinorUnits,
      status: 'DRAFT',
      memo: input.memo,
      lines: Object.freeze(lines),
    })

    this.#payments.set(id, payment)
    return ok(payment)
  }

  async postPayment(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      PaymentVoucherSnapshot,
      | TreasuryError
      | PaymentNotFoundError
      | InvalidPaymentStateError
      | InsufficientFundsError
      | BankAccountNotFoundError
    >
  > {
    const payment = this.#payments.get(id)
    if (!payment) {
      return err(new PaymentNotFoundError(id))
    }

    if (payment.status !== 'DRAFT') {
      return err(new InvalidPaymentStateError(payment.status, 'post'))
    }

    const bankAccount = this.#bankAccounts.get(payment.bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(payment.bankAccountId))
    }

    if (bankAccount.currentBalanceMinorUnits < payment.amountMinorUnits) {
      return err(
        new InsufficientFundsError(
          bankAccount.id,
          bankAccount.currentBalanceMinorUnits,
          payment.amountMinorUnits
        )
      )
    }

    // 1. Deduct bank balance
    this.#bankAccounts.set(bankAccount.id, {
      ...bankAccount,
      currentBalanceMinorUnits: bankAccount.currentBalanceMinorUnits - payment.amountMinorUnits,
    })

    // 2. Create Double-Entry Accounting Voucher in Finance
    let journalEntryId: string | undefined
    if (this.finance) {
      journalEntryId = `je-pmt-${payment.id}`
      const zeroRes = Money.zero(payment.currency)
      const amtRes = Money.fromMinorUnits(payment.amountMinorUnits, payment.currency)
      if (zeroRes.isOk && amtRes.isOk) {
        const zero = zeroRes.value
        const amt = amtRes.value
        const lines: JournalLine[] = [
          {
            accountId: 'acc-2100-ap-vendor',
            debit: amt,
            credit: zero,
            memo: `Payment AP reduction for ${payment.paymentNumber}`,
          },
          {
            accountId: bankAccount.glAccountId,
            debit: zero,
            credit: amt,
            memo: `Bank disbursement for ${payment.paymentNumber}`,
          },
        ]
        await this.finance.createDraft(
          {
            id: journalEntryId,
            companyId: payment.companyId,
            number: `JE-PMT-${payment.paymentNumber}`,
            accountingDate: payment.paymentDate,
            memo: payment.memo || `Payment Voucher ${payment.paymentNumber}`,
            lines,
          },
          options
        )
      }
    }

    const posted: PaymentVoucherSnapshot = Object.freeze({
      ...payment,
      status: 'POSTED',
      journalEntryId,
      postedAt: new Date(),
    })

    this.#payments.set(id, posted)
    this.eventEmitter?.emit(
      PaymentProcessedEvent.EVENT_NAME,
      new PaymentProcessedEvent(
        posted.id,
        posted.companyId,
        posted.bankAccountId,
        posted.beneficiaryId,
        posted.amountMinorUnits,
        posted.currency,
        posted.postedAt!
      )
    )

    return ok(posted)
  }

  async getPayment(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<PaymentVoucherSnapshot, PaymentNotFoundError>> {
    const payment = this.#payments.get(id)
    if (!payment) {
      return err(new PaymentNotFoundError(id))
    }
    return ok(payment)
  }

  async createReceipt(
    input: CreateReceiptInput,
    _options?: TransactionOptions
  ): Promise<Result<ReceiptVoucherSnapshot, TreasuryError | BankAccountNotFoundError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const bankAccountId = input.bankAccountId.trim()
    const receiptNumber = input.receiptNumber.trim()
    const receiptDate = input.receiptDate.trim()
    const payerId = input.payerId.trim()

    if (!id || !companyId || !bankAccountId || !receiptNumber || !receiptDate || !payerId) {
      return err(
        new TreasuryError('Receipt id, bankAccountId, receiptNumber, date, and payer are required')
      )
    }

    if (input.amountMinorUnits <= 0n) {
      return err(new TreasuryError('Receipt amount must be greater than zero'))
    }

    const bankAccount = this.#bankAccounts.get(bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(bankAccountId))
    }

    const lines = (input.lines ?? []).map((l) =>
      Object.freeze({
        referenceId: l.referenceId,
        appliedAmountMinorUnits: l.appliedAmountMinorUnits,
        memo: l.memo,
      })
    )

    const receipt: ReceiptVoucherSnapshot = Object.freeze({
      id,
      companyId,
      bankAccountId,
      receiptNumber,
      receiptDate,
      payerType: input.payerType,
      payerId,
      currency: input.currency || bankAccount.currency,
      amountMinorUnits: input.amountMinorUnits,
      status: 'DRAFT',
      memo: input.memo,
      lines: Object.freeze(lines),
    })

    this.#receipts.set(id, receipt)
    return ok(receipt)
  }

  async postReceipt(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      ReceiptVoucherSnapshot,
      TreasuryError | ReceiptNotFoundError | InvalidReceiptStateError | BankAccountNotFoundError
    >
  > {
    const receipt = this.#receipts.get(id)
    if (!receipt) {
      return err(new ReceiptNotFoundError(id))
    }

    if (receipt.status !== 'DRAFT') {
      return err(new InvalidReceiptStateError(receipt.status, 'post'))
    }

    const bankAccount = this.#bankAccounts.get(receipt.bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(receipt.bankAccountId))
    }

    // 1. Increase bank balance
    this.#bankAccounts.set(bankAccount.id, {
      ...bankAccount,
      currentBalanceMinorUnits: bankAccount.currentBalanceMinorUnits + receipt.amountMinorUnits,
    })

    // 2. Create Double-Entry Accounting Voucher in Finance
    let journalEntryId: string | undefined
    if (this.finance) {
      journalEntryId = `je-rcpt-${receipt.id}`
      const zeroRes = Money.zero(receipt.currency)
      const amtRes = Money.fromMinorUnits(receipt.amountMinorUnits, receipt.currency)
      if (zeroRes.isOk && amtRes.isOk) {
        const zero = zeroRes.value
        const amt = amtRes.value
        const lines: JournalLine[] = [
          {
            accountId: bankAccount.glAccountId,
            debit: amt,
            credit: zero,
            memo: `Bank deposit for ${receipt.receiptNumber}`,
          },
          {
            accountId: 'account-ar-receivable',
            debit: zero,
            credit: amt,
            memo: `Customer AR settlement for ${receipt.receiptNumber}`,
          },
        ]
        await this.finance.createDraft(
          {
            id: journalEntryId,
            companyId: receipt.companyId,
            number: `JE-RCPT-${receipt.receiptNumber}`,
            accountingDate: receipt.receiptDate,
            memo: receipt.memo || `Receipt Voucher ${receipt.receiptNumber}`,
            lines,
          },
          options
        )
      }
    }

    const posted: ReceiptVoucherSnapshot = Object.freeze({
      ...receipt,
      status: 'POSTED',
      journalEntryId,
      postedAt: new Date(),
    })

    this.#receipts.set(id, posted)
    this.eventEmitter?.emit(
      ReceiptProcessedEvent.EVENT_NAME,
      new ReceiptProcessedEvent(
        posted.id,
        posted.companyId,
        posted.bankAccountId,
        posted.payerId,
        posted.amountMinorUnits,
        posted.currency,
        posted.postedAt!
      )
    )

    return ok(posted)
  }

  async getReceipt(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<ReceiptVoucherSnapshot, ReceiptNotFoundError>> {
    const receipt = this.#receipts.get(id)
    if (!receipt) {
      return err(new ReceiptNotFoundError(id))
    }
    return ok(receipt)
  }

  async importBankStatement(
    input: ImportBankStatementInput,
    _options?: TransactionOptions
  ): Promise<Result<BankStatementSnapshot, TreasuryError | BankAccountNotFoundError>> {
    const bankAccount = this.#bankAccounts.get(input.bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(input.bankAccountId))
    }

    const lines: BankStatementLineSnapshot[] = input.lines.map((l) =>
      Object.freeze({
        id: l.id,
        transactionDate: l.transactionDate,
        direction: l.direction,
        amountMinorUnits: l.amountMinorUnits,
        reference: l.reference,
        description: l.description,
        isMatched: false,
      })
    )

    const statement: BankStatementSnapshot = Object.freeze({
      id: input.id,
      bankAccountId: input.bankAccountId,
      statementNumber: input.statementNumber,
      statementDate: input.statementDate,
      openingBalanceMinorUnits: input.openingBalanceMinorUnits,
      closingBalanceMinorUnits: input.closingBalanceMinorUnits,
      lines: Object.freeze(lines),
    })

    this.#bankStatements.set(input.id, statement)
    return ok(statement)
  }

  async reconcileBankStatement(
    statementId: string
  ): Promise<
    Result<
      BankReconciliationResult,
      TreasuryError | BankStatementNotFoundError | BankAccountNotFoundError
    >
  > {
    const statement = this.#bankStatements.get(statementId)
    if (!statement) {
      return err(new BankStatementNotFoundError(statementId))
    }

    const bankAccount = this.#bankAccounts.get(statement.bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(statement.bankAccountId))
    }

    // Collect all posted vouchers for this bank account
    const recordedVouchers = [
      ...[...this.#payments.values()]
        .filter((p) => p.bankAccountId === bankAccount.id && p.status === 'POSTED')
        .map((p) => ({
          id: p.id,
          number: p.paymentNumber,
          date: p.paymentDate,
          type: 'PAYMENT' as const,
          amountMinorUnits: p.amountMinorUnits,
        })),
      ...[...this.#receipts.values()]
        .filter((r) => r.bankAccountId === bankAccount.id && r.status === 'POSTED')
        .map((r) => ({
          id: r.id,
          number: r.receiptNumber,
          date: r.receiptDate,
          type: 'RECEIPT' as const,
          amountMinorUnits: r.amountMinorUnits,
        })),
    ]

    const { result, updatedLines } = BankReconciliationMatcher.reconcile({
      statementId,
      bankAccountId: bankAccount.id,
      bookBalanceMinorUnits: bankAccount.currentBalanceMinorUnits,
      statementClosingBalanceMinorUnits: statement.closingBalanceMinorUnits,
      statementLines: statement.lines,
      recordedVouchers,
    })

    // Update statement with matched lines
    this.#bankStatements.set(statementId, {
      ...statement,
      lines: updatedLines,
    })

    this.eventEmitter?.emit(
      BankStatementReconciledEvent.EVENT_NAME,
      new BankStatementReconciledEvent(
        statementId,
        bankAccount.id,
        result.matchedCount,
        result.unmatchedCount,
        result.isBalanced,
        new Date()
      )
    )

    return ok(result)
  }
}
