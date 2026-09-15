import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type { ScopeForbiddenError } from '@platform/security/index.js'
import type { JournalLine } from './journal_entry.js'
import type {
  AccountingPeriodError,
  FinanceQueryError,
  InactiveAccountError,
  JournalEntryAlreadyPostedError,
  JournalEntryAlreadyReversedError,
  JournalEntryNotFoundError,
  JournalEntryPersistenceError,
} from './finance_errors.js'

export type CreateJournalEntryDraftInput = Readonly<{
  id: string
  companyId: string
  number: string
  accountingDate: string
  memo?: string
  lines: readonly JournalLine[]
}>

export type JournalEntryDraftSnapshot = Readonly<{
  id: string
  companyId: string
  number: string
  accountingDate: string
  currency: string
  status: 'DRAFT' | 'POSTED' | 'VOID'
  totalDebitMinorUnits: bigint
  totalCreditMinorUnits: bigint
  memo?: string
}>

export type LedgerLineSnapshot = Readonly<{
  entryId: string
  entryNumber: string
  accountingDate: string
  accountId: string
  accountCode: string
  accountName: string
  debitMinorUnits: bigint
  creditMinorUnits: bigint
  currency: string
}>

export type TrialBalanceLine = Readonly<{
  accountId: string
  accountCode: string
  accountName: string
  debitMinorUnits: bigint
  creditMinorUnits: bigint
}>

export type ReverseJournalEntryInput = Readonly<{
  id: string
  number: string
  accountingDate: string
  memo?: string
}>

export type FinanceWriteContext = Readonly<{
  requestId?: string
}>

export abstract class FinanceContract {
  abstract createDraft(
    input: CreateJournalEntryDraftInput,
    options?: TransactionOptions
  ): Promise<Result<JournalEntryDraftSnapshot, JournalEntryPersistenceError | ScopeForbiddenError>>

  abstract postDraft(
    entryId: string,
    context?: FinanceWriteContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | AccountingPeriodError
      | InactiveAccountError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >
  >

  abstract ledger(
    companyId: string,
    from: string,
    to: string,
    options?: TransactionOptions
  ): Promise<Result<readonly LedgerLineSnapshot[], FinanceQueryError | ScopeForbiddenError>>

  abstract trialBalance(
    companyId: string,
    from: string,
    to: string,
    options?: TransactionOptions
  ): Promise<Result<readonly TrialBalanceLine[], FinanceQueryError | ScopeForbiddenError>>

  abstract reverse(
    entryId: string,
    input: ReverseJournalEntryInput,
    context?: FinanceWriteContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | JournalEntryAlreadyReversedError
      | AccountingPeriodError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >
  >
}
