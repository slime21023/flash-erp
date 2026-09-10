import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type {
  BankAccountAlreadyExistsError,
  BankAccountNotFoundError,
  BankStatementNotFoundError,
  InsufficientFundsError,
  InvalidPaymentStateError,
  InvalidReceiptStateError,
  PaymentNotFoundError,
  ReceiptNotFoundError,
  TreasuryError,
} from './treasury_errors.js'

export type RegisterBankAccountInput = Readonly<{
  id: string
  companyId: string
  accountNumber: string
  bankCode: string
  bankName: string
  accountName: string
  currency?: string
  glAccountId: string
  initialBalanceMinorUnits?: bigint
}>

export type BankAccountSnapshot = Readonly<{
  id: string
  companyId: string
  accountNumber: string
  bankCode: string
  bankName: string
  accountName: string
  currency: string
  glAccountId: string
  currentBalanceMinorUnits: bigint
  isActive: boolean
}>

export type PaymentLineInput = Readonly<{
  invoiceId: string
  appliedAmountMinorUnits: bigint
  memo?: string
}>

export type PaymentLineSnapshot = Readonly<{
  invoiceId: string
  appliedAmountMinorUnits: bigint
  memo?: string
}>

export type CreatePaymentInput = Readonly<{
  id: string
  companyId: string
  bankAccountId: string
  paymentNumber: string
  paymentDate: string
  beneficiaryType: 'SUPPLIER' | 'OTHER'
  beneficiaryId: string
  currency?: string
  amountMinorUnits: bigint
  glPayableAccountId?: string
  memo?: string
  lines?: readonly PaymentLineInput[]
}>

export type PaymentVoucherSnapshot = Readonly<{
  id: string
  companyId: string
  bankAccountId: string
  paymentNumber: string
  paymentDate: string
  beneficiaryType: 'SUPPLIER' | 'OTHER'
  beneficiaryId: string
  currency: string
  amountMinorUnits: bigint
  status: 'DRAFT' | 'POSTED' | 'CANCELLED'
  journalEntryId?: string
  memo?: string
  lines: readonly PaymentLineSnapshot[]
  postedAt?: Date
}>

export type ReceiptLineInput = Readonly<{
  referenceId: string
  appliedAmountMinorUnits: bigint
  memo?: string
}>

export type ReceiptLineSnapshot = Readonly<{
  referenceId: string
  appliedAmountMinorUnits: bigint
  memo?: string
}>

export type CreateReceiptInput = Readonly<{
  id: string
  companyId: string
  bankAccountId: string
  receiptNumber: string
  receiptDate: string
  payerType: 'CUSTOMER' | 'OTHER'
  payerId: string
  currency?: string
  amountMinorUnits: bigint
  glReceivableAccountId?: string
  memo?: string
  lines?: readonly ReceiptLineInput[]
}>

export type ReceiptVoucherSnapshot = Readonly<{
  id: string
  companyId: string
  bankAccountId: string
  receiptNumber: string
  receiptDate: string
  payerType: 'CUSTOMER' | 'OTHER'
  payerId: string
  currency: string
  amountMinorUnits: bigint
  status: 'DRAFT' | 'POSTED' | 'CANCELLED'
  journalEntryId?: string
  memo?: string
  lines: readonly ReceiptLineSnapshot[]
  postedAt?: Date
}>

export type BankStatementLineInput = Readonly<{
  id: string
  transactionDate: string
  direction: 'DEBIT' | 'CREDIT'
  amountMinorUnits: bigint
  reference: string
  description?: string
}>

export type BankStatementLineSnapshot = Readonly<{
  id: string
  transactionDate: string
  direction: 'DEBIT' | 'CREDIT'
  amountMinorUnits: bigint
  reference: string
  description?: string
  isMatched: boolean
  matchedVoucherId?: string
}>

export type ImportBankStatementInput = Readonly<{
  id: string
  bankAccountId: string
  statementNumber: string
  statementDate: string
  openingBalanceMinorUnits: bigint
  closingBalanceMinorUnits: bigint
  lines: readonly BankStatementLineInput[]
}>

export type BankStatementSnapshot = Readonly<{
  id: string
  bankAccountId: string
  statementNumber: string
  statementDate: string
  openingBalanceMinorUnits: bigint
  closingBalanceMinorUnits: bigint
  lines: readonly BankStatementLineSnapshot[]
}>

export type BankReconciliationResult = Readonly<{
  statementId: string
  bankAccountId: string
  bookBalanceMinorUnits: bigint
  bankStatementBalanceMinorUnits: bigint
  depositsInTransitMinorUnits: bigint
  outstandingChecksMinorUnits: bigint
  adjustedBookBalanceMinorUnits: bigint
  adjustedBankBalanceMinorUnits: bigint
  differenceMinorUnits: bigint
  isBalanced: boolean
  matchedCount: number
  unmatchedCount: number
  matchedLineIds: readonly string[]
  unmatchedLineIds: readonly string[]
}>

export abstract class TreasuryContract {
  abstract registerBankAccount(
    input: RegisterBankAccountInput,
    options?: TransactionOptions
  ): Promise<Result<BankAccountSnapshot, TreasuryError | BankAccountAlreadyExistsError>>

  abstract getBankAccount(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<BankAccountSnapshot, BankAccountNotFoundError>>

  abstract listBankAccounts(
    companyId: string,
    options?: TransactionOptions
  ): Promise<Result<readonly BankAccountSnapshot[], TreasuryError>>

  abstract createPayment(
    input: CreatePaymentInput,
    options?: TransactionOptions
  ): Promise<Result<PaymentVoucherSnapshot, TreasuryError | BankAccountNotFoundError>>

  abstract postPayment(
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
  >

  abstract getPayment(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<PaymentVoucherSnapshot, PaymentNotFoundError>>

  abstract createReceipt(
    input: CreateReceiptInput,
    options?: TransactionOptions
  ): Promise<Result<ReceiptVoucherSnapshot, TreasuryError | BankAccountNotFoundError>>

  abstract postReceipt(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      ReceiptVoucherSnapshot,
      TreasuryError | ReceiptNotFoundError | InvalidReceiptStateError | BankAccountNotFoundError
    >
  >

  abstract getReceipt(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<ReceiptVoucherSnapshot, ReceiptNotFoundError>>

  abstract importBankStatement(
    input: ImportBankStatementInput,
    options?: TransactionOptions
  ): Promise<Result<BankStatementSnapshot, TreasuryError | BankAccountNotFoundError>>

  abstract reconcileBankStatement(
    statementId: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      BankReconciliationResult,
      TreasuryError | BankStatementNotFoundError | BankAccountNotFoundError
    >
  >
}
