import { DomainError } from '@platform/fp/index.js'

export class ScopeRequiredError extends DomainError {
  readonly code = 'SCOPE_REQUIRED'

  constructor() {
    super('An organization unit scope is required')
  }
}

export class ScopeForbiddenError extends DomainError {
  readonly code = 'SCOPE_FORBIDDEN'

  constructor(
    readonly organizationUnitId: string,
    readonly resource?: string
  ) {
    super(
      resource
        ? `Organization unit scope is not authorized for ${resource}: ${organizationUnitId}`
        : `Organization unit scope is not authorized: ${organizationUnitId}`
    )
  }
}
