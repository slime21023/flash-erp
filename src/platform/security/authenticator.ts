import type { DomainError, Result } from '../fp/index.js'

export type LoginCredentials = Readonly<{
  username: string
  password: string
}>

export type AuthenticatedPrincipal = Readonly<{
  id: string
  username: string
  displayName: string
  isActive: boolean
  roles: readonly string[]
}>

export type AuthSession = Readonly<{
  accessToken: string
  expiresAt: Date
  user: AuthenticatedPrincipal
}>

/** Platform seam for a bearer-token authentication provider. */
export abstract class Authenticator {
  abstract login(credentials: LoginCredentials): Promise<Result<AuthSession, DomainError>>

  abstract authenticate(accessToken: string): Promise<Result<AuthenticatedPrincipal, DomainError>>

  abstract logout(accessToken: string): Promise<Result<void, DomainError>>
}
