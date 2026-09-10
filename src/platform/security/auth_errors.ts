import { DomainError } from '../fp/domain_error.js'

export class AuthenticationFailedError extends DomainError {
  readonly code = 'AUTHENTICATION_FAILED'

  constructor() {
    super('Authentication failed')
  }
}
