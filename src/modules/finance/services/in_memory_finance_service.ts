import {
  FinanceContract,
  JournalEntryPersistenceError,
  FinanceQueryError,
  JournalEntry,
} from '../contracts/index.js'
import type {
  CreateJournalEntryDraftInput,
  JournalEntryDraftSnapshot,
  LedgerLineSnapshot,
  TrialBalanceLine,
  ReverseJournalEntryInput,
  FinanceWriteContext,
} from '../contracts/finance_contract.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'

export class InMemoryFinanceService extends FinanceContract {
  readonly #postedEntries = new Map<string, JournalEntry>()
  readonly #draftEntries = new Map<
    string,
    { input: CreateJournalEntryDraftInput; status: 'DRAFT' | 'POSTED'; entry: JournalEntry }
  >()

  async createDraft(
    input: CreateJournalEntryDraftInput,
    _options?: TransactionOptions
  ): Promise<Result<JournalEntryDraftSnapshot, JournalEntryPersistenceError>> {
    if (this.#draftEntries.has(input.id)) {
      return err(new JournalEntryPersistenceError(`Draft already exists: ${input.id}`))
    }

    const entryRes = JournalEntry.create(input.id, input.lines)
    if (entryRes.isErr) {
      return err(new JournalEntryPersistenceError(entryRes.error.message))
    }

    const entry = entryRes.value
    this.#draftEntries.set(input.id, { input, status: 'DRAFT', entry })

    return ok({
      id: input.id,
      companyId: input.companyId,
      number: input.number,
      accountingDate: input.accountingDate,
      currency: entry.currency,
      status: 'DRAFT',
      totalDebitMinorUnits: entry.totalDebit.minorUnits,
      totalCreditMinorUnits: entry.totalCredit.minorUnits,
      memo: input.memo,
    })
  }

  async postDraft(
    entryId: string,
    _context?: FinanceWriteContext,
    _options?: TransactionOptions
  ): Promise<Result<JournalEntryDraftSnapshot, JournalEntryPersistenceError>> {
    const draft = this.#draftEntries.get(entryId)
    if (!draft) {
      return err(new JournalEntryPersistenceError(`Draft not found: ${entryId}`))
    }

    if (draft.status === 'POSTED') {
      return err(new JournalEntryPersistenceError(`Draft already posted: ${entryId}`))
    }

    draft.status = 'POSTED'
    this.#postedEntries.set(draft.entry.id, draft.entry)

    return ok({
      id: draft.input.id,
      companyId: draft.input.companyId,
      number: draft.input.number,
      accountingDate: draft.input.accountingDate,
      currency: draft.entry.currency,
      status: 'POSTED',
      totalDebitMinorUnits: draft.entry.totalDebit.minorUnits,
      totalCreditMinorUnits: draft.entry.totalCredit.minorUnits,
      memo: draft.input.memo,
    })
  }

  async ledger(): Promise<Result<readonly LedgerLineSnapshot[], FinanceQueryError>> {
    return err(new FinanceQueryError('In-memory finance does not support ledger queries'))
  }

  async trialBalance(): Promise<Result<readonly TrialBalanceLine[], FinanceQueryError>> {
    return err(new FinanceQueryError('In-memory finance does not support trial-balance queries'))
  }

  async reverse(
    _entryId: string,
    _input: ReverseJournalEntryInput,
    _context?: FinanceWriteContext,
    _options?: TransactionOptions
  ): Promise<Result<JournalEntryDraftSnapshot, JournalEntryPersistenceError>> {
    return err(new JournalEntryPersistenceError('In-memory finance does not support reversals'))
  }
}
