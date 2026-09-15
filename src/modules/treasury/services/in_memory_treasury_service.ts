import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { createHash } from 'node:crypto'
import { Money } from '@platform/kernel/index.js'
import type { FinanceContract, JournalLine } from '@modules/finance/contracts/index.js'
import type { SalesContract } from '@modules/sales/contracts/index.js'
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

function stableReference(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex')
  return `${prefix}-${digest.slice(0, 48)}`
}

function boundedReference(prefix: string, value: string): string {
  const plain = `${prefix}-${value}`
  return plain.length <= 64 ? plain : stableReference(prefix, value)
}

export class InMemoryTreasuryService extends TreasuryContract {
  readonly #bankAccounts = new Map<string, BankAccountSnapshot>()
  readonly #payments = new Map<string, PaymentVoucherSnapshot>()
  readonly #receipts = new Map<string, ReceiptVoucherSnapshot>()
  readonly #bankStatements = new Map<string, BankStatementSnapshot>()

  constructor(
    private readonly finance?: FinanceContract,
    private readonly eventEmitter?: EventEmitter2,
    private readonly sales?: SalesContract
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
    const currency = (input.currency || 'TWD').trim().toUpperCase()

    if (
      !id ||
      !companyId ||
      !accountNumber ||
      !bankCode ||
      !bankName ||
      !accountName ||
      !glAccountId ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return err(new TreasuryError('All bank account fields are required'))
    }

    if ((input.initialBalanceMinorUnits ?? 0n) < 0n) {
      return err(new TreasuryError('Initial bank balance cannot be negative'))
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
      currency,
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

    if (
      this.#payments.has(id) ||
      [...this.#payments.values()].some(
        (payment) => payment.companyId === companyId && payment.paymentNumber === paymentNumber
      )
    ) {
      return err(new TreasuryError(`Payment already exists: ${id}`))
    }

    if (input.amountMinorUnits <= 0n) {
      return err(new TreasuryError('Payment amount must be greater than zero'))
    }

    const lines = (input.lines ?? []).map((line) =>
      Object.freeze({
        invoiceId: line.invoiceId.trim(),
        appliedAmountMinorUnits: line.appliedAmountMinorUnits,
        memo: line.memo,
      })
    )
    const lineIds = new Set(lines.map((line) => line.invoiceId))
    if (
      lines.some((line) => !line.invoiceId || line.appliedAmountMinorUnits <= 0n) ||
      lineIds.size !== lines.length ||
      (lines.length > 0 &&
        lines.reduce((sum, line) => sum + line.appliedAmountMinorUnits, 0n) !==
          input.amountMinorUnits)
    ) {
      return err(
        new TreasuryError('Payment lines must be unique, positive, and equal payment amount')
      )
    }
    const bankAccount = this.#bankAccounts.get(bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(bankAccountId))
    }
    const currency = (input.currency || bankAccount.currency).trim().toUpperCase()
    if (
      bankAccount.companyId !== companyId ||
      !bankAccount.isActive ||
      bankAccount.currency !== currency
    ) {
      return err(
        new TreasuryError('Bank account must be active, in the same company, and currency')
      )
    }

    const payment: PaymentVoucherSnapshot = Object.freeze({
      id,
      companyId,
      bankAccountId,
      paymentNumber,
      paymentDate,
      beneficiaryType: input.beneficiaryType,
      beneficiaryId,
      currency,
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
    if (
      bankAccount.companyId !== payment.companyId ||
      !bankAccount.isActive ||
      bankAccount.currency !== payment.currency
    ) {
      return err(new TreasuryError('Payment bank account company or currency mismatch'))
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

    // Create the accounting voucher before mutating the in-memory balance.
    let journalEntryId: string | undefined
    if (this.finance) {
      journalEntryId = boundedReference('je-pmt', payment.id)
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
        const draftRes = await this.finance.createDraft(
          {
            id: journalEntryId,
            companyId: payment.companyId,
            number: boundedReference('JE-PMT', payment.paymentNumber),
            accountingDate: payment.paymentDate,
            memo: payment.memo || `Payment Voucher ${payment.paymentNumber}`,
            lines,
          },
          options
        )
        if (draftRes.isErr) return err(new TreasuryError(draftRes.error.message))
        const postRes = await this.finance.postDraft(journalEntryId, undefined, options)
        if (postRes.isErr) return err(new TreasuryError(postRes.error.message))
      }
    }

    this.#bankAccounts.set(bankAccount.id, {
      ...bankAccount,
      currentBalanceMinorUnits: bankAccount.currentBalanceMinorUnits - payment.amountMinorUnits,
    })

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

    if (
      this.#receipts.has(id) ||
      [...this.#receipts.values()].some(
        (receipt) => receipt.companyId === companyId && receipt.receiptNumber === receiptNumber
      )
    ) {
      return err(new TreasuryError(`Receipt already exists: ${id}`))
    }

    if (input.amountMinorUnits <= 0n) {
      return err(new TreasuryError('Receipt amount must be greater than zero'))
    }

    const lines = (input.lines ?? []).map((line) =>
      Object.freeze({
        referenceId: line.referenceId.trim(),
        appliedAmountMinorUnits: line.appliedAmountMinorUnits,
        memo: line.memo,
      })
    )
    const lineIds = new Set(lines.map((line) => line.referenceId))
    if (
      lines.some((line) => !line.referenceId || line.appliedAmountMinorUnits <= 0n) ||
      lineIds.size !== lines.length ||
      (lines.length > 0 &&
        lines.reduce((sum, line) => sum + line.appliedAmountMinorUnits, 0n) !==
          input.amountMinorUnits)
    ) {
      return err(
        new TreasuryError('Receipt lines must be unique, positive, and equal receipt amount')
      )
    }
    const bankAccount = this.#bankAccounts.get(bankAccountId)
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(bankAccountId))
    }
    const currency = (input.currency || bankAccount.currency).trim().toUpperCase()
    if (
      bankAccount.companyId !== companyId ||
      !bankAccount.isActive ||
      bankAccount.currency !== currency
    ) {
      return err(
        new TreasuryError('Bank account must be active, in the same company, and currency')
      )
    }

    const receipt: ReceiptVoucherSnapshot = Object.freeze({
      id,
      companyId,
      bankAccountId,
      receiptNumber,
      receiptDate,
      payerType: input.payerType,
      payerId,
      currency,
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
    if (
      bankAccount.companyId !== receipt.companyId ||
      !bankAccount.isActive ||
      bankAccount.currency !== receipt.currency
    ) {
      return err(new TreasuryError('Receipt bank account company or currency mismatch'))
    }

    if (this.sales && receipt.payerType === 'CUSTOMER') {
      const customerRes = await this.sales.getCustomer(receipt.payerId, options)
      if (
        customerRes.isErr ||
        customerRes.value.companyId !== receipt.companyId ||
        !customerRes.value.isActive ||
        customerRes.value.currency !== receipt.currency ||
        customerRes.value.currentOutstandingMinorUnits < receipt.amountMinorUnits
      ) {
        return err(new TreasuryError('Customer receivable settlement is invalid'))
      }
    }

    // Create the accounting voucher before mutating the in-memory balance.
    let journalEntryId: string | undefined
    if (this.finance) {
      journalEntryId = boundedReference('je-rcpt', receipt.id)
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
        const draftRes = await this.finance.createDraft(
          {
            id: journalEntryId,
            companyId: receipt.companyId,
            number: boundedReference('JE-RCPT', receipt.receiptNumber),
            accountingDate: receipt.receiptDate,
            memo: receipt.memo || `Receipt Voucher ${receipt.receiptNumber}`,
            lines,
          },
          options
        )
        if (draftRes.isErr) return err(new TreasuryError(draftRes.error.message))
        const postRes = await this.finance.postDraft(journalEntryId, undefined, options)
        if (postRes.isErr) return err(new TreasuryError(postRes.error.message))
      }
    }

    if (this.sales && receipt.payerType === 'CUSTOMER') {
      const settlementRes = await this.sales.settleCustomerReceivable(
        {
          companyId: receipt.companyId,
          customerId: receipt.payerId,
          amountMinorUnits: receipt.amountMinorUnits,
          currency: receipt.currency,
          referenceId: receipt.id,
        },
        options
      )
      if (settlementRes.isErr) return err(new TreasuryError(settlementRes.error.message))
    }

    this.#bankAccounts.set(bankAccount.id, {
      ...bankAccount,
      currentBalanceMinorUnits: bankAccount.currentBalanceMinorUnits + receipt.amountMinorUnits,
    })

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
