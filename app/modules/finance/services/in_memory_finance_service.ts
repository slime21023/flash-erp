import { FinanceContract, JournalEntryAlreadyPostedError } from '#modules/finance/contracts/index'
import type { JournalEntry } from '#modules/finance/contracts/index'
import type { TransactionOptions } from '#platform/persistence/index'
import { err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'

export class InMemoryFinanceService extends FinanceContract {
  readonly #postedEntries = new Map<string, JournalEntry>()

  async post(
    entry: JournalEntry,
    _options?: TransactionOptions
  ): Promise<Result<JournalEntry, JournalEntryAlreadyPostedError>> {
    if (this.#postedEntries.has(entry.id)) {
      return err(new JournalEntryAlreadyPostedError(entry.id))
    }

    this.#postedEntries.set(entry.id, entry)
    return ok(entry)
  }
}
