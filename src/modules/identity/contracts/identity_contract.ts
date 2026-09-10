import type { DomainError, Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type {
  AuthSession,
  AuthenticatedPrincipal,
  LoginCredentials,
} from '@platform/security/index.js'
import type {
  AccessDeniedError,
  IdentityAlreadyExistsError,
  InvalidIdentityInputError,
} from './identity_errors.js'

export type LocalUserSnapshot = Readonly<{
  id: string
  username: string
  displayName: string
  isActive: boolean
}>

export type RegisterLocalUserInput = Readonly<{
  id: string
  username: string
  password?: string
  displayName: string
  /** @deprecated Internal fixtures may provide a pre-hashed value. */
  passwordHash?: string
}>

import { Authorizer } from '@platform/security/index.js'

/** Public seam for local authentication today and an OIDC subject adapter later. */
export abstract class IdentityContract extends Authorizer {
  abstract registerLocalUser(
    input: RegisterLocalUserInput,
    options?: TransactionOptions
  ): Promise<Result<LocalUserSnapshot, InvalidIdentityInputError | IdentityAlreadyExistsError>>

  abstract login(credentials: LoginCredentials): Promise<Result<AuthSession, DomainError>>

  abstract authenticate(accessToken: string): Promise<Result<AuthenticatedPrincipal, DomainError>>

  abstract logout(accessToken: string): Promise<Result<void, DomainError>>

  abstract authorize(
    userId: string,
    permission: string,
    organizationUnitId: string,
    options?: TransactionOptions
  ): Promise<Result<void, AccessDeniedError>>
}
