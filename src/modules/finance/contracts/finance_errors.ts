import { DomainError } from '@platform/fp/index.js'

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

export class AccountingPeriodError extends DomainError {
  readonly code = 'ACCOUNTING_PERIOD_UNAVAILABLE'
  constructor(
    readonly companyId: string,
    readonly accountingDate: string
  ) {
    super(`No open accounting period for ${companyId} on ${accountingDate}`)
  }
}

export class JournalEntryNotFoundError extends DomainError {
  readonly code = 'JOURNAL_ENTRY_NOT_FOUND'
  constructor(readonly entryId: string) {
    super(`Journal entry not found: ${entryId}`)
  }
}

export class JournalEntryPersistenceError extends DomainError {
  readonly code = 'JOURNAL_ENTRY_PERSISTENCE_ERROR'
  constructor(message: string) {
    super(message)
  }
}

export class FinanceQueryError extends DomainError {
  readonly code = 'FINANCE_QUERY_ERROR'
  constructor(message: string) {
    super(message)
  }
}

export class JournalEntryAlreadyReversedError extends DomainError {
  readonly code = 'JOURNAL_ENTRY_ALREADY_REVERSED'
  constructor(readonly entryId: string) {
    super(`Journal entry already reversed: ${entryId}`)
  }
}

export class CompanyAccountingSettingsError extends DomainError {
  readonly code = 'COMPANY_ACCOUNTING_SETTINGS_INVALID'
  constructor(
    readonly companyId: string,
    message: string
  ) {
    super(message)
  }
}
