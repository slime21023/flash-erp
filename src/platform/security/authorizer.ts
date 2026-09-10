import type { DomainError, Result } from '../fp/index.js'

export abstract class Authorizer {
  abstract authorize(
    userId: string,
    permission: string,
    organizationUnitId: string
  ): Promise<Result<void, DomainError>>
}
