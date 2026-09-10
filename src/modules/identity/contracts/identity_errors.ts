import { DomainError } from '@platform/fp/index.js'

export class InvalidIdentityInputError extends DomainError {
  readonly code = 'INVALID_IDENTITY_INPUT'
  constructor(message: string) {
    super(message)
  }
}

export class IdentityAlreadyExistsError extends DomainError {
  readonly code = 'IDENTITY_ALREADY_EXISTS'
  constructor(readonly username: string) {
    super(`Identity already exists: ${username}`)
  }
}

export class AccessDeniedError extends DomainError {
  readonly code = 'ACCESS_DENIED'
  constructor(readonly permission: string) {
    super(`Access denied for permission: ${permission}`)
  }
}
