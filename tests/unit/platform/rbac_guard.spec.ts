import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Reflector } from '@nestjs/core'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { RbacGuard } from '@platform/security/rbac.guard.js'
import { REQUIRE_PERMISSION_KEY } from '@platform/security/require_permission.decorator.js'
import { Authorizer } from '@platform/security/authorizer.js'
import { ok, err, DomainError } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'

class MockAccessDeniedError extends DomainError {
  readonly code = 'ACCESS_DENIED'
  constructor() {
    super('User lacks required permission')
  }
}

class MockAuthorizer extends Authorizer {
  async authorize(
    userId: string,
    permission: string,
    organizationUnitId: string
  ): Promise<Result<void, DomainError>> {
    if (userId === 'admin' && permission === 'CAN_APPROVE' && organizationUnitId === 'org-1') {
      return ok(undefined)
    }
    return err(new MockAccessDeniedError())
  }
}

function createMockContext(metadata: string | undefined, req: Record<string, any>) {
  const reflector = new Reflector()
  reflector.getAllAndOverride = () => metadata as any

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as any

  return { reflector, context }
}

test('RbacGuard allows requests when no permission is required', async () => {
  const authorizer = new MockAuthorizer()
  const { reflector, context } = createMockContext(undefined, {})
  const guard = new RbacGuard(reflector, authorizer)

  const allowed = await guard.canActivate(context)
  assert.equal(allowed, true)
})

test('RbacGuard rejects requests with missing user identification', async () => {
  const authorizer = new MockAuthorizer()
  const { reflector, context } = createMockContext('CAN_APPROVE', { headers: {} })
  const guard = new RbacGuard(reflector, authorizer)

  await assert.rejects(async () => {
    await guard.canActivate(context)
  }, UnauthorizedException)
})

test('RbacGuard rejects requests with missing organization unit scope', async () => {
  const authorizer = new MockAuthorizer()
  const { reflector, context } = createMockContext('CAN_APPROVE', {
    headers: { 'x-user-id': 'admin' },
  })
  const guard = new RbacGuard(reflector, authorizer)

  await assert.rejects(async () => {
    await guard.canActivate(context)
  }, ForbiddenException)
})

test('RbacGuard allows authorized user within valid organization scope', async () => {
  const authorizer = new MockAuthorizer()
  const { reflector, context } = createMockContext('CAN_APPROVE', {
    headers: {
      'x-user-id': 'admin',
      'x-org-unit-id': 'org-1',
    },
  })
  const guard = new RbacGuard(reflector, authorizer)

  const allowed = await guard.canActivate(context)
  assert.equal(allowed, true)
})

test('RbacGuard denies unauthorized user or invalid permission', async () => {
  const authorizer = new MockAuthorizer()
  const { reflector, context } = createMockContext('CAN_APPROVE', {
    headers: {
      'x-user-id': 'unauthorized_user',
      'x-org-unit-id': 'org-1',
    },
  })
  const guard = new RbacGuard(reflector, authorizer)

  await assert.rejects(async () => {
    await guard.canActivate(context)
  }, ForbiddenException)
})
