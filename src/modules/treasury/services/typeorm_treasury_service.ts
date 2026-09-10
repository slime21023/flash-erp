import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import {
  OutboxService,
  type TransactionOptions,
  runInTransaction,
} from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import { FinanceContract, type JournalLine } from '@modules/finance/contracts/index.js'
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
  type BankStatementSnapshot,
  type CreatePaymentInput,
  type CreateReceiptInput,
  type ImportBankStatementInput,
  type PaymentVoucherSnapshot,
  type ReceiptVoucherSnapshot,
  type RegisterBankAccountInput,
} from '../contracts/index.js'
import { BankAccountEntity } from '../entities/bank_account.entity.js'
import { PaymentVoucherEntity } from '../entities/payment_voucher.entity.js'
import { PaymentVoucherLineEntity } from '../entities/payment_voucher_line.entity.js'
import { ReceiptVoucherEntity } from '../entities/receipt_voucher.entity.js'
import { ReceiptVoucherLineEntity } from '../entities/receipt_voucher_line.entity.js'
import { BankStatementEntity } from '../entities/bank_statement.entity.js'
import { BankStatementLineEntity } from '../entities/bank_statement_line.entity.js'
import { BankReconciliationMatcher } from './bank_reconciliation_matcher.js'

@Injectable()
export class TypeOrmTreasuryService extends TreasuryContract {
  constructor(
    @InjectRepository(BankAccountEntity)
    private readonly bankAccountRepo: Repository<BankAccountEntity>,
    @InjectRepository(PaymentVoucherEntity)
    private readonly paymentRepo: Repository<PaymentVoucherEntity>,
    @InjectRepository(PaymentVoucherLineEntity)
    private readonly paymentLineRepo: Repository<PaymentVoucherLineEntity>,
    @InjectRepository(ReceiptVoucherEntity)
    private readonly receiptRepo: Repository<ReceiptVoucherEntity>,
    @InjectRepository(ReceiptVoucherLineEntity)
    private readonly receiptLineRepo: Repository<ReceiptVoucherLineEntity>,
    @InjectRepository(BankStatementEntity)
    private readonly statementRepo: Repository<BankStatementEntity>,
    @InjectRepository(BankStatementLineEntity)
    private readonly statementLineRepo: Repository<BankStatementLineEntity>,
    private readonly finance: FinanceContract,
    private readonly outbox: OutboxService
  ) {
    super()
  }

  async registerBankAccount(
    input: RegisterBankAccountInput,
    options?: TransactionOptions
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

    const manager = options?.client ?? this.bankAccountRepo.manager
    const existing = await manager.findOne(BankAccountEntity, {
      where: [{ id }, { companyId, accountNumber }],
    })
    if (existing) {
      return err(new BankAccountAlreadyExistsError(accountNumber))
    }

    try {
      const entity = manager.create(BankAccountEntity, {
        id,
        companyId,
        accountNumber,
        bankCode,
        bankName,
        accountName,
        currency: input.currency || 'TWD',
        glAccountId,
        currentBalanceMinorUnits: (input.initialBalanceMinorUnits ?? 0n).toString(),
        isActive: true,
      })
      await manager.save(entity)

      return ok({
        id: entity.id,
        companyId: entity.companyId,
        accountNumber: entity.accountNumber,
        bankCode: entity.bankCode,
        bankName: entity.bankName,
        accountName: entity.accountName,
        currency: entity.currency,
        glAccountId: entity.glAccountId,
        currentBalanceMinorUnits: BigInt(entity.currentBalanceMinorUnits),
        isActive: entity.isActive,
      })
    } catch {
      return err(new TreasuryError(`Unable to register bank account: ${id}`))
    }
  }

  async getBankAccount(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<BankAccountSnapshot, BankAccountNotFoundError>> {
    const manager = options?.client ?? this.bankAccountRepo.manager
    const entity = await manager.findOne(BankAccountEntity, { where: { id } })
    if (!entity) {
      return err(new BankAccountNotFoundError(id))
    }
    return ok({
      id: entity.id,
      companyId: entity.companyId,
      accountNumber: entity.accountNumber,
      bankCode: entity.bankCode,
      bankName: entity.bankName,
      accountName: entity.accountName,
      currency: entity.currency,
      glAccountId: entity.glAccountId,
      currentBalanceMinorUnits: BigInt(entity.currentBalanceMinorUnits),
      isActive: entity.isActive,
    })
  }

  async listBankAccounts(
    companyId: string,
    options?: TransactionOptions
  ): Promise<Result<readonly BankAccountSnapshot[], TreasuryError>> {
    const manager = options?.client ?? this.bankAccountRepo.manager
    const accounts = await manager.find(BankAccountEntity, { where: { companyId } })
    return ok(
      accounts.map((a) => ({
        id: a.id,
        companyId: a.companyId,
        accountNumber: a.accountNumber,
        bankCode: a.bankCode,
        bankName: a.bankName,
        accountName: a.accountName,
        currency: a.currency,
        glAccountId: a.glAccountId,
        currentBalanceMinorUnits: BigInt(a.currentBalanceMinorUnits),
        isActive: a.isActive,
      }))
    )
  }

  async createPayment(
    input: CreatePaymentInput,
    options?: TransactionOptions
  ): Promise<Result<PaymentVoucherSnapshot, TreasuryError | BankAccountNotFoundError>> {
    return runInTransaction<PaymentVoucherSnapshot, TreasuryError | BankAccountNotFoundError>(
      this.paymentRepo.manager,
      options,
      async (client) => {
        const id = input.id.trim()
        const companyId = input.companyId.trim()
        const bankAccountId = input.bankAccountId.trim()
        const paymentNumber = input.paymentNumber.trim()
        const paymentDate = input.paymentDate.trim()
        const beneficiaryId = input.beneficiaryId.trim()

        if (
          !id ||
          !companyId ||
          !bankAccountId ||
          !paymentNumber ||
          !paymentDate ||
          !beneficiaryId
        ) {
          return err(new TreasuryError('Payment fields are required'))
        }

        if (input.amountMinorUnits <= 0n) {
          return err(new TreasuryError('Payment amount must be greater than zero'))
        }

        const bankAccount = await client.findOne(BankAccountEntity, {
          where: { id: bankAccountId },
        })
        if (!bankAccount) {
          return err(new BankAccountNotFoundError(bankAccountId))
        }

        try {
          const entity = client.create(PaymentVoucherEntity, {
            id,
            companyId,
            bankAccountId,
            paymentNumber,
            paymentDate,
            beneficiaryType: input.beneficiaryType,
            beneficiaryId,
            currency: input.currency || bankAccount.currency,
            amountMinorUnits: input.amountMinorUnits.toString(),
            status: 'DRAFT',
            memo: input.memo,
            lines: (input.lines ?? []).map((l, index) =>
              client.create(PaymentVoucherLineEntity, {
                id: `${id}-line-${index}`,
                paymentVoucherId: id,
                invoiceId: l.invoiceId,
                appliedAmountMinorUnits: l.appliedAmountMinorUnits.toString(),
                memo: l.memo,
              })
            ),
          })
          await client.save(entity)

          return ok({
            id: entity.id,
            companyId: entity.companyId,
            bankAccountId: entity.bankAccountId,
            paymentNumber: entity.paymentNumber,
            paymentDate: entity.paymentDate,
            beneficiaryType: entity.beneficiaryType,
            beneficiaryId: entity.beneficiaryId,
            currency: entity.currency,
            amountMinorUnits: BigInt(entity.amountMinorUnits),
            status: entity.status,
            memo: entity.memo,
            lines: entity.lines.map((l) => ({
              invoiceId: l.invoiceId,
              appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
              memo: l.memo,
            })),
          })
        } catch {
          return err(new TreasuryError(`Unable to create payment voucher: ${id}`))
        }
      }
    )
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
    return runInTransaction<
      PaymentVoucherSnapshot,
      | TreasuryError
      | PaymentNotFoundError
      | InvalidPaymentStateError
      | InsufficientFundsError
      | BankAccountNotFoundError
    >(this.paymentRepo.manager, options, async (client) => {
      const payment = await client.findOne(PaymentVoucherEntity, {
        where: { id },
        relations: ['lines'],
      })
      if (!payment) {
        return err(new PaymentNotFoundError(id))
      }

      if (payment.status !== 'DRAFT') {
        return err(new InvalidPaymentStateError(payment.status, 'post'))
      }

      const bankAccount = await client.findOne(BankAccountEntity, {
        where: { id: payment.bankAccountId },
      })
      if (!bankAccount) {
        return err(new BankAccountNotFoundError(payment.bankAccountId))
      }

      const currentBalance = BigInt(bankAccount.currentBalanceMinorUnits)
      const paymentAmount = BigInt(payment.amountMinorUnits)

      if (currentBalance < paymentAmount) {
        return err(new InsufficientFundsError(bankAccount.id, currentBalance, paymentAmount))
      }

      // 1. Update bank account balance
      bankAccount.currentBalanceMinorUnits = (currentBalance - paymentAmount).toString()
      await client.save(bankAccount)

      // 2. Finance Double-Entry
      let journalEntryId: string | undefined
      {
        journalEntryId = `je-pmt-${payment.id}`
        const zeroRes = Money.zero(payment.currency)
        const amtRes = Money.fromMinorUnits(paymentAmount, payment.currency)
        if (zeroRes.isOk && amtRes.isOk) {
          const lines: JournalLine[] = [
            {
              accountId: 'acc-2100-ap-vendor',
              debit: amtRes.value,
              credit: zeroRes.value,
              memo: `Payment AP reduction for ${payment.paymentNumber}`,
            },
            {
              accountId: bankAccount.glAccountId,
              debit: zeroRes.value,
              credit: amtRes.value,
              memo: `Bank disbursement for ${payment.paymentNumber}`,
            },
          ]
          const draftRes = await this.finance.createDraft(
            {
              id: journalEntryId,
              companyId: payment.companyId,
              number: `JE-PMT-${payment.paymentNumber}`,
              accountingDate: payment.paymentDate,
              memo: payment.memo || `Payment Voucher ${payment.paymentNumber}`,
              lines,
            },
            { client }
          )
          if (draftRes.isErr) {
            return err(new TreasuryError(`Finance createDraft failed: ${draftRes.error.message}`))
          }
        }
      }

      payment.status = 'POSTED'
      payment.journalEntryId = journalEntryId
      payment.postedAt = new Date()
      await client.save(payment)

      const eventResult = await this.outbox.enqueue(
        PaymentProcessedEvent.EVENT_NAME,
        new PaymentProcessedEvent(
          payment.id,
          payment.companyId,
          payment.bankAccountId,
          payment.beneficiaryId,
          paymentAmount,
          payment.currency,
          payment.postedAt
        ),
        { client }
      )
      if (eventResult.isErr) return err(new TreasuryError(eventResult.error.message))

      return ok({
        id: payment.id,
        companyId: payment.companyId,
        bankAccountId: payment.bankAccountId,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        beneficiaryType: payment.beneficiaryType,
        beneficiaryId: payment.beneficiaryId,
        currency: payment.currency,
        amountMinorUnits: paymentAmount,
        status: payment.status,
        journalEntryId,
        memo: payment.memo,
        lines: payment.lines.map((l) => ({
          invoiceId: l.invoiceId,
          appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
          memo: l.memo,
        })),
        postedAt: payment.postedAt,
      })
    })
  }

  async getPayment(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<PaymentVoucherSnapshot, PaymentNotFoundError>> {
    const manager = options?.client ?? this.paymentRepo.manager
    const entity = await manager.findOne(PaymentVoucherEntity, {
      where: { id },
      relations: ['lines'],
    })
    if (!entity) {
      return err(new PaymentNotFoundError(id))
    }
    return ok({
      id: entity.id,
      companyId: entity.companyId,
      bankAccountId: entity.bankAccountId,
      paymentNumber: entity.paymentNumber,
      paymentDate: entity.paymentDate,
      beneficiaryType: entity.beneficiaryType,
      beneficiaryId: entity.beneficiaryId,
      currency: entity.currency,
      amountMinorUnits: BigInt(entity.amountMinorUnits),
      status: entity.status,
      journalEntryId: entity.journalEntryId,
      memo: entity.memo,
      lines: entity.lines.map((l) => ({
        invoiceId: l.invoiceId,
        appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
        memo: l.memo,
      })),
      postedAt: entity.postedAt,
    })
  }

  async createReceipt(
    input: CreateReceiptInput,
    options?: TransactionOptions
  ): Promise<Result<ReceiptVoucherSnapshot, TreasuryError | BankAccountNotFoundError>> {
    return runInTransaction<ReceiptVoucherSnapshot, TreasuryError | BankAccountNotFoundError>(
      this.receiptRepo.manager,
      options,
      async (client) => {
        const id = input.id.trim()
        const companyId = input.companyId.trim()
        const bankAccountId = input.bankAccountId.trim()
        const receiptNumber = input.receiptNumber.trim()
        const receiptDate = input.receiptDate.trim()
        const payerId = input.payerId.trim()

        if (!id || !companyId || !bankAccountId || !receiptNumber || !receiptDate || !payerId) {
          return err(new TreasuryError('Receipt fields are required'))
        }

        if (input.amountMinorUnits <= 0n) {
          return err(new TreasuryError('Receipt amount must be greater than zero'))
        }

        const bankAccount = await client.findOne(BankAccountEntity, {
          where: { id: bankAccountId },
        })
        if (!bankAccount) {
          return err(new BankAccountNotFoundError(bankAccountId))
        }

        try {
          const entity = client.create(ReceiptVoucherEntity, {
            id,
            companyId,
            bankAccountId,
            receiptNumber,
            receiptDate,
            payerType: input.payerType,
            payerId,
            currency: input.currency || bankAccount.currency,
            amountMinorUnits: input.amountMinorUnits.toString(),
            status: 'DRAFT',
            memo: input.memo,
            lines: (input.lines ?? []).map((l, index) =>
              client.create(ReceiptVoucherLineEntity, {
                id: `${id}-line-${index}`,
                receiptVoucherId: id,
                referenceId: l.referenceId,
                appliedAmountMinorUnits: l.appliedAmountMinorUnits.toString(),
                memo: l.memo,
              })
            ),
          })
          await client.save(entity)

          return ok({
            id: entity.id,
            companyId: entity.companyId,
            bankAccountId: entity.bankAccountId,
            receiptNumber: entity.receiptNumber,
            receiptDate: entity.receiptDate,
            payerType: entity.payerType,
            payerId: entity.payerId,
            currency: entity.currency,
            amountMinorUnits: BigInt(entity.amountMinorUnits),
            status: entity.status,
            memo: entity.memo,
            lines: entity.lines.map((l) => ({
              referenceId: l.referenceId,
              appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
              memo: l.memo,
            })),
          })
        } catch {
          return err(new TreasuryError(`Unable to create receipt voucher: ${id}`))
        }
      }
    )
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
    return runInTransaction<
      ReceiptVoucherSnapshot,
      TreasuryError | ReceiptNotFoundError | InvalidReceiptStateError | BankAccountNotFoundError
    >(this.receiptRepo.manager, options, async (client) => {
      const receipt = await client.findOne(ReceiptVoucherEntity, {
        where: { id },
        relations: ['lines'],
      })
      if (!receipt) {
        return err(new ReceiptNotFoundError(id))
      }

      if (receipt.status !== 'DRAFT') {
        return err(new InvalidReceiptStateError(receipt.status, 'post'))
      }

      const bankAccount = await client.findOne(BankAccountEntity, {
        where: { id: receipt.bankAccountId },
      })
      if (!bankAccount) {
        return err(new BankAccountNotFoundError(receipt.bankAccountId))
      }

      const currentBalance = BigInt(bankAccount.currentBalanceMinorUnits)
      const receiptAmount = BigInt(receipt.amountMinorUnits)

      // 1. Update bank account balance
      bankAccount.currentBalanceMinorUnits = (currentBalance + receiptAmount).toString()
      await client.save(bankAccount)

      // 2. Finance Double-Entry
      let journalEntryId: string | undefined
      {
        journalEntryId = `je-rcpt-${receipt.id}`
        const zeroRes = Money.zero(receipt.currency)
        const amtRes = Money.fromMinorUnits(receiptAmount, receipt.currency)
        if (zeroRes.isOk && amtRes.isOk) {
          const lines: JournalLine[] = [
            {
              accountId: bankAccount.glAccountId,
              debit: amtRes.value,
              credit: zeroRes.value,
              memo: `Bank deposit for ${receipt.receiptNumber}`,
            },
            {
              accountId: 'account-ar-receivable',
              debit: zeroRes.value,
              credit: amtRes.value,
              memo: `Customer AR settlement for ${receipt.receiptNumber}`,
            },
          ]
          const draftRes = await this.finance.createDraft(
            {
              id: journalEntryId,
              companyId: receipt.companyId,
              number: `JE-RCPT-${receipt.receiptNumber}`,
              accountingDate: receipt.receiptDate,
              memo: receipt.memo || `Receipt Voucher ${receipt.receiptNumber}`,
              lines,
            },
            { client }
          )
          if (draftRes.isErr) {
            return err(new TreasuryError(`Finance createDraft failed: ${draftRes.error.message}`))
          }
        }
      }

      receipt.status = 'POSTED'
      receipt.journalEntryId = journalEntryId
      receipt.postedAt = new Date()
      await client.save(receipt)

      const eventResult = await this.outbox.enqueue(
        ReceiptProcessedEvent.EVENT_NAME,
        new ReceiptProcessedEvent(
          receipt.id,
          receipt.companyId,
          receipt.bankAccountId,
          receipt.payerId,
          receiptAmount,
          receipt.currency,
          receipt.postedAt
        ),
        { client }
      )
      if (eventResult.isErr) return err(new TreasuryError(eventResult.error.message))

      return ok({
        id: receipt.id,
        companyId: receipt.companyId,
        bankAccountId: receipt.bankAccountId,
        receiptNumber: receipt.receiptNumber,
        receiptDate: receipt.receiptDate,
        payerType: receipt.payerType,
        payerId: receipt.payerId,
        currency: receipt.currency,
        amountMinorUnits: receiptAmount,
        status: receipt.status,
        journalEntryId,
        memo: receipt.memo,
        lines: receipt.lines.map((l) => ({
          referenceId: l.referenceId,
          appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
          memo: l.memo,
        })),
        postedAt: receipt.postedAt,
      })
    })
  }

  async getReceipt(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<ReceiptVoucherSnapshot, ReceiptNotFoundError>> {
    const manager = options?.client ?? this.receiptRepo.manager
    const entity = await manager.findOne(ReceiptVoucherEntity, {
      where: { id },
      relations: ['lines'],
    })
    if (!entity) {
      return err(new ReceiptNotFoundError(id))
    }
    return ok({
      id: entity.id,
      companyId: entity.companyId,
      bankAccountId: entity.bankAccountId,
      receiptNumber: entity.receiptNumber,
      receiptDate: entity.receiptDate,
      payerType: entity.payerType,
      payerId: entity.payerId,
      currency: entity.currency,
      amountMinorUnits: BigInt(entity.amountMinorUnits),
      status: entity.status,
      journalEntryId: entity.journalEntryId,
      memo: entity.memo,
      lines: entity.lines.map((l) => ({
        referenceId: l.referenceId,
        appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
        memo: l.memo,
      })),
      postedAt: entity.postedAt,
    })
  }

  async importBankStatement(
    input: ImportBankStatementInput,
    options?: TransactionOptions
  ): Promise<Result<BankStatementSnapshot, TreasuryError | BankAccountNotFoundError>> {
    const manager = options?.client ?? this.statementRepo.manager
    const bankAccount = await manager.findOne(BankAccountEntity, {
      where: { id: input.bankAccountId },
    })
    if (!bankAccount) {
      return err(new BankAccountNotFoundError(input.bankAccountId))
    }

    try {
      const entity = manager.create(BankStatementEntity, {
        id: input.id,
        bankAccountId: input.bankAccountId,
        statementNumber: input.statementNumber,
        statementDate: input.statementDate,
        openingBalanceMinorUnits: input.openingBalanceMinorUnits.toString(),
        closingBalanceMinorUnits: input.closingBalanceMinorUnits.toString(),
        lines: input.lines.map((l) =>
          manager.create(BankStatementLineEntity, {
            id: l.id,
            bankStatementId: input.id,
            transactionDate: l.transactionDate,
            direction: l.direction,
            amountMinorUnits: l.amountMinorUnits.toString(),
            reference: l.reference,
            description: l.description,
            isMatched: false,
          })
        ),
      })
      await manager.save(entity)

      return ok({
        id: entity.id,
        bankAccountId: entity.bankAccountId,
        statementNumber: entity.statementNumber,
        statementDate: entity.statementDate,
        openingBalanceMinorUnits: BigInt(entity.openingBalanceMinorUnits),
        closingBalanceMinorUnits: BigInt(entity.closingBalanceMinorUnits),
        lines: entity.lines.map((l) => ({
          id: l.id,
          transactionDate: l.transactionDate,
          direction: l.direction,
          amountMinorUnits: BigInt(l.amountMinorUnits),
          reference: l.reference,
          description: l.description,
          isMatched: l.isMatched,
          matchedVoucherId: l.matchedVoucherId,
        })),
      })
    } catch {
      return err(new TreasuryError(`Unable to import bank statement: ${input.id}`))
    }
  }

  async reconcileBankStatement(
    statementId: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      BankReconciliationResult,
      TreasuryError | BankStatementNotFoundError | BankAccountNotFoundError
    >
  > {
    return runInTransaction<
      BankReconciliationResult,
      TreasuryError | BankStatementNotFoundError | BankAccountNotFoundError
    >(this.statementRepo.manager, options, async (manager) => {
      const statement = await manager.findOne(BankStatementEntity, {
        where: { id: statementId },
        relations: ['lines'],
      })
      if (!statement) {
        return err(new BankStatementNotFoundError(statementId))
      }

      const bankAccount = await manager.findOne(BankAccountEntity, {
        where: { id: statement.bankAccountId },
      })
      if (!bankAccount) {
        return err(new BankAccountNotFoundError(statement.bankAccountId))
      }

      // Collect posted payments & receipts
      const payments: PaymentVoucherEntity[] = await manager.find(PaymentVoucherEntity, {
        where: { bankAccountId: bankAccount.id, status: 'POSTED' },
      })
      const receipts: ReceiptVoucherEntity[] = await manager.find(ReceiptVoucherEntity, {
        where: { bankAccountId: bankAccount.id, status: 'POSTED' },
      })

      const recordedVouchers = [
        ...payments.map((p: PaymentVoucherEntity) => ({
          id: p.id,
          number: p.paymentNumber,
          date: p.paymentDate,
          type: 'PAYMENT' as const,
          amountMinorUnits: BigInt(p.amountMinorUnits),
        })),
        ...receipts.map((r: ReceiptVoucherEntity) => ({
          id: r.id,
          number: r.receiptNumber,
          date: r.receiptDate,
          type: 'RECEIPT' as const,
          amountMinorUnits: BigInt(r.amountMinorUnits),
        })),
      ]

      const statementLines = statement.lines ?? []
      const statementLinesSnapshot = statementLines.map((l: BankStatementLineEntity) => ({
        id: l.id,
        transactionDate: l.transactionDate,
        direction: l.direction,
        amountMinorUnits: BigInt(l.amountMinorUnits),
        reference: l.reference,
        description: l.description,
        isMatched: l.isMatched,
        matchedVoucherId: l.matchedVoucherId,
      }))

      const { result, updatedLines } = BankReconciliationMatcher.reconcile({
        statementId,
        bankAccountId: bankAccount.id,
        bookBalanceMinorUnits: BigInt(bankAccount.currentBalanceMinorUnits),
        statementClosingBalanceMinorUnits: BigInt(statement.closingBalanceMinorUnits),
        statementLines: statementLinesSnapshot,
        recordedVouchers,
      })

      // Update lines in DB
      for (const up of updatedLines) {
        const dbLine = statementLines.find((l: BankStatementLineEntity) => l.id === up.id)
        if (dbLine) {
          dbLine.isMatched = up.isMatched
          dbLine.matchedVoucherId = up.matchedVoucherId
          await manager.save(dbLine)
        }
      }

      const eventResult = await this.outbox.enqueue(
        BankStatementReconciledEvent.EVENT_NAME,
        new BankStatementReconciledEvent(
          statementId,
          bankAccount.id,
          result.matchedCount,
          result.unmatchedCount,
          result.isBalanced,
          new Date()
        ),
        { client: manager }
      )
      if (eventResult.isErr) return err(new TreasuryError(eventResult.error.message))

      return ok(result)
    })
  }
}
