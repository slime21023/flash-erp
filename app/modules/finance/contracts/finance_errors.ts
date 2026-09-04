import { DomainError } from '#platform/fp/index'

export class JournalEntryAlreadyPostedError extends DomainError {
  readonly code = 'JOURNAL_ENTRY_ALREADY_POSTED'

  constructor(readonly entryId: string) {
    super(`Journal entry already posted: ${entryId}`)
  }
}
