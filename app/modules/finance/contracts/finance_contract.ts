import type { Result } from '#platform/fp/index'
import type { TransactionOptions } from '#platform/persistence/index'
import type { JournalEntry } from './journal_entry.js'
import type { JournalEntryAlreadyPostedError } from './finance_errors.js'

export abstract class FinanceContract {
  abstract post(
    entry: JournalEntry,
    options?: TransactionOptions
  ): Promise<Result<JournalEntry, JournalEntryAlreadyPostedError>>
}
