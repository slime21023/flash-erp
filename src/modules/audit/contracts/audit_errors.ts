import { DomainError } from '@platform/fp/index.js'

export class InvalidAuditEntryError extends DomainError {
  readonly code = 'INVALID_AUDIT_ENTRY'

  constructor(message: string) {
    super(message)
  }
}
