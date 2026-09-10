import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomBytes } from 'node:crypto'
import { IsNull, MoreThan, Repository } from 'typeorm'
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
import { LocalUserEntity } from '../entities/local_user.entity.js'
import { AuthSessionEntity } from '../entities/auth_session.entity.js'
import { UserRoleEntity } from '../entities/user_role.entity.js'
import { RolePermissionEntity } from '../entities/role_permission.entity.js'
import { UserOrganizationScopeEntity } from '../entities/user_organization_scope.entity.js'
import { hashPassword, verifyPassword } from './password.js'

@Injectable()
export class TypeOrmIdentityService extends IdentityContract {
  constructor(
    @InjectRepository(LocalUserEntity)
    private readonly userRepo: Repository<LocalUserEntity>,
    @InjectRepository(AuthSessionEntity)
    private readonly sessionRepo: Repository<AuthSessionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>
  ) {
    super()
  }

  async registerLocalUser(
    input: RegisterLocalUserInput,
    options?: TransactionOptions
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

    let passwordHash = legacyPasswordHash
    if (password) {
      try {
        passwordHash = await hashPassword(password)
      } catch {
        return err(new InvalidIdentityInputError('password could not be secured'))
      }
    }

    const manager = options?.client ?? this.userRepo.manager

    const existing = await manager
      .createQueryBuilder(LocalUserEntity, 'u')
      .where('u.id = :id OR u.username = :username', { id, username })
      .getOne()

    if (existing) {
      return err(new IdentityAlreadyExistsError(username))
    }

    try {
      const user = manager.create(LocalUserEntity, {
        id,
        username,
        passwordHash,
        displayName,
        isActive: true,
      })
      await manager.save(user)
      return ok({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        isActive: user.isActive,
      })
    } catch {
      return err(new IdentityAlreadyExistsError(username))
    }
  }

  async login(
    credentials: LoginCredentials
  ): Promise<Result<AuthSession, AuthenticationFailedError>> {
    const username =
      typeof credentials?.username === 'string' ? credentials.username.trim().toLowerCase() : ''
    const password = typeof credentials?.password === 'string' ? credentials.password : ''
    if (!username || !password) return err(new AuthenticationFailedError())

    const user = await this.userRepo.findOneBy({ username })
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      return err(new AuthenticationFailedError())
    }

    const accessToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
    const session = this.sessionRepo.create({
      tokenHash: createHash('sha256').update(accessToken).digest('hex'),
      userId: user.id,
      expiresAt,
      revokedAt: null,
    })
    await this.sessionRepo.save(session)

    return ok({ accessToken, expiresAt, user: await this.principal(user) })
  }

  async authenticate(
    accessToken: string
  ): Promise<Result<AuthenticatedPrincipal, AuthenticationFailedError>> {
    if (!accessToken || accessToken.length > 256) return err(new AuthenticationFailedError())

    const tokenHash = createHash('sha256').update(accessToken).digest('hex')
    const session = await this.sessionRepo.findOne({
      where: { tokenHash, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    })
    if (!session) return err(new AuthenticationFailedError())

    const user = await this.userRepo.findOneBy({ id: session.userId, isActive: true })
    if (!user) return err(new AuthenticationFailedError())

    return ok(await this.principal(user))
  }

  async logout(accessToken: string): Promise<Result<void, AuthenticationFailedError>> {
    if (!accessToken) return err(new AuthenticationFailedError())
    const tokenHash = createHash('sha256').update(accessToken).digest('hex')
    const session = await this.sessionRepo.findOneBy({ tokenHash })
    if (!session) return err(new AuthenticationFailedError())
    if (!session.revokedAt) {
      session.revokedAt = new Date()
      await this.sessionRepo.save(session)
    }
    return ok(undefined)
  }

  async authorize(
    userId: string,
    permission: string,
    organizationUnitId: string,
    options?: TransactionOptions
  ): Promise<Result<void, AccessDeniedError>> {
    const manager = options?.client ?? this.userRepo.manager

    const grant = await manager
      .createQueryBuilder(LocalUserEntity, 'u')
      .innerJoin(UserRoleEntity, 'ur', 'ur.user_id = u.id')
      .innerJoin(RolePermissionEntity, 'rp', 'rp.role_id = ur.role_id')
      .innerJoin(UserOrganizationScopeEntity, 'us', 'us.user_id = u.id')
      .where('u.id = :userId', { userId })
      .andWhere('u.is_active = :isActive', { isActive: true })
      .andWhere('rp.permission_code = :permission', { permission })
      .andWhere('us.organization_unit_id = :organizationUnitId', { organizationUnitId })
      .getOne()

    return grant ? ok(undefined) : err(new AccessDeniedError(permission))
  }

  private async principal(user: LocalUserEntity): Promise<AuthenticatedPrincipal> {
    const assignments = await this.userRoleRepo.find({
      where: { userId: user.id },
      relations: ['role'],
    })
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isActive: user.isActive,
      roles: assignments.map((assignment) => assignment.role?.code ?? assignment.roleId),
    }
  }
}
