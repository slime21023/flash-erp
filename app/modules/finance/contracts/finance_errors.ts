import { DomainError } from '#platform/fp/index'

export class JournalEntryAlreadyPostedError extends DomainError {
  readonly code = 'JOURNAL_ENTRY_ALREADY_POSTED'

  constructor(readonly entryId: string) {
    super(`Journal entry already posted: ${entryId}`)
  }
}

export class InvalidAccountError extends DomainError {
  readonly code = 'INVALID_ACCOUNT'

  constructor(message: string) {
    super(message)
  }
}
export class AccountAlreadyExistsError extends DomainError {
  readonly code = 'ACCOUNT_ALREADY_EXISTS'
  constructor(identifier: string) {
    super(`Account already exists: ${identifier}`)
  }
}
export class AccountNotFoundError extends DomainError {
  readonly code = 'ACCOUNT_NOT_FOUND'
  constructor(identifier: string) {
    super(`Account not found: ${identifier}`)
  }
}
export class InactiveAccountError extends DomainError {
  readonly code = 'INACTIVE_ACCOUNT'
  constructor(identifier: string) {
    super(`Account is inactive: ${identifier}`)
  }
}
