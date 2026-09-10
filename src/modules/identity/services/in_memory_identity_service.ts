import { createHash, randomBytes } from 'node:crypto'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type {
  AuthSession,
  AuthenticatedPrincipal,
  LoginCredentials,
} from '@platform/security/index.js'
import { AuthenticationFailedError } from '@platform/security/index.js'
import {
  AccessDeniedError,
  IdentityAlreadyExistsError,
  IdentityContract,
  InvalidIdentityInputError,
} from '../contracts/index.js'
import type { LocalUserSnapshot, RegisterLocalUserInput } from '../contracts/index.js'
import { hashPassword, verifyPassword } from './password.js'

export class InMemoryIdentityService extends IdentityContract {
  readonly #users = new Map<string, LocalUserSnapshot & { passwordHash: string }>()
  readonly #sessions = new Map<
    string,
    { userId: string; expiresAt: Date; revokedAt: Date | null }
  >()
  readonly #userRoles = new Set<string>() // "userId:roleId"
  readonly #rolePermissions = new Set<string>() // "roleId:permission"
  readonly #userScopes = new Set<string>() // "userId:orgUnitId"

  assignRole(userId: string, roleId: string) {
    this.#userRoles.add(`${userId}:${roleId}`)
  }

  grantPermission(roleId: string, permission: string) {
    this.#rolePermissions.add(`${roleId}:${permission}`)
  }

  assignScope(userId: string, organizationUnitId: string) {
    this.#userScopes.add(`${userId}:${organizationUnitId}`)
  }

  async registerLocalUser(
    input: RegisterLocalUserInput,
    _options?: TransactionOptions
  ): Promise<Result<LocalUserSnapshot, InvalidIdentityInputError | IdentityAlreadyExistsError>> {
    const id = typeof input?.id === 'string' ? input.id.trim() : ''
    const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase() : ''
    const displayName = typeof input?.displayName === 'string' ? input.displayName.trim() : ''
    const password = typeof input?.password === 'string' ? input.password : ''
    const legacyPasswordHash =
      typeof input?.passwordHash === 'string' ? input.passwordHash.trim() : ''

    if (!id || !username || !displayName || (!password && !legacyPasswordHash)) {
      return err(
        new InvalidIdentityInputError('id, username, password, and displayName are required')
      )
    }

    if (password && password.length < 8) {
      return err(new InvalidIdentityInputError('password must contain at least 8 characters'))
    }

    if (this.#users.has(id) || [...this.#users.values()].some((u) => u.username === username)) {
      return err(new IdentityAlreadyExistsError(username))
    }

    const passwordHash = password ? await hashPassword(password) : legacyPasswordHash
    const snapshot = {
      id,
      username,
      displayName,
      isActive: true,
      passwordHash,
    }

    this.#users.set(id, snapshot)
    return ok({
      id: snapshot.id,
      username: snapshot.username,
      displayName: snapshot.displayName,
      isActive: snapshot.isActive,
    })
  }

  async login(
    credentials: LoginCredentials
  ): Promise<Result<AuthSession, AuthenticationFailedError>> {
    const username =
      typeof credentials?.username === 'string' ? credentials.username.trim().toLowerCase() : ''
    const password = typeof credentials?.password === 'string' ? credentials.password : ''
    const user = [...this.#users.values()].find((candidate) => candidate.username === username)
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      return err(new AuthenticationFailedError())
    }

    const accessToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
    this.#sessions.set(createHash('sha256').update(accessToken).digest('hex'), {
      userId: user.id,
      expiresAt,
      revokedAt: null,
    })

    return ok({ accessToken, expiresAt, user: this.principal(user) })
  }

  async authenticate(
    accessToken: string
  ): Promise<Result<AuthenticatedPrincipal, AuthenticationFailedError>> {
    const session = this.#sessions.get(createHash('sha256').update(accessToken).digest('hex'))
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return err(new AuthenticationFailedError())
    }
    const user = this.#users.get(session.userId)
    if (!user || !user.isActive) return err(new AuthenticationFailedError())
    return ok(this.principal(user))
  }

  async logout(accessToken: string): Promise<Result<void, AuthenticationFailedError>> {
    const session = this.#sessions.get(createHash('sha256').update(accessToken).digest('hex'))
    if (!session) return err(new AuthenticationFailedError())
    session.revokedAt = new Date()
    return ok(undefined)
  }

  async authorize(
    userId: string,
    permission: string,
    organizationUnitId: string,
    _options?: TransactionOptions
  ): Promise<Result<void, AccessDeniedError>> {
    const user = this.#users.get(userId)
    if (!user || !user.isActive) {
      return err(new AccessDeniedError(permission))
    }

    const hasScope = this.#userScopes.has(`${userId}:${organizationUnitId}`)
    if (!hasScope) {
      return err(new AccessDeniedError(permission))
    }

    // Find roles assigned to user
    const userRoleIds: string[] = []
    for (const ur of this.#userRoles) {
      const [uId, rId] = ur.split(':')
      if (uId === userId && rId) {
        userRoleIds.push(rId)
      }
    }

    // Check if any role has permission
    const hasPerm = userRoleIds.some((roleId) =>
      this.#rolePermissions.has(`${roleId}:${permission}`)
    )

    return hasPerm ? ok(undefined) : err(new AccessDeniedError(permission))
  }

  private principal(user: LocalUserSnapshot & { passwordHash: string }): AuthenticatedPrincipal {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isActive: user.isActive,
      roles: [...this.#userRoles]
        .filter((value) => value.startsWith(`${user.id}:`))
        .map((value) => value.slice(user.id.length + 1)),
    }
  }
}
