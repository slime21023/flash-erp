import { DomainError } from '#platform/fp/index'

export class InvalidOrganizationUnitError extends DomainError {
  readonly code = 'INVALID_ORGANIZATION_UNIT'

  constructor(message: string) {
    super(message)
  }
}

export class OrganizationUnitAlreadyExistsError extends DomainError {
  readonly code = 'ORGANIZATION_UNIT_ALREADY_EXISTS'

  constructor(readonly id: string) {
    super(`Organization unit already exists: ${id}`)
  }
}

export class OrganizationUnitNotFoundError extends DomainError {
  readonly code = 'ORGANIZATION_UNIT_NOT_FOUND'

  constructor(readonly id: string) {
    super(`Organization unit not found: ${id}`)
  }
}
