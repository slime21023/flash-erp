import assert from 'node:assert/strict'
import { test } from 'vitest'
import { InMemoryIdentityService } from '@modules/identity/services/in_memory_identity_service.js'

test('identity service registers and authorizes a user with role and org scope', async () => {
  const service = new InMemoryIdentityService()
  const registered = await service.registerLocalUser({
    id: 'user-001',
    username: ' Alice ',
    passwordHash: 'hashed-pw',
    displayName: 'Alice Engineer',
  })

  assert.equal(registered.isOk, true)
  if (registered.isOk) {
    assert.equal(registered.value.username, 'alice')
    assert.equal(registered.value.isActive, true)
  }

  // Setup roles and permissions
  service.assignRole('user-001', 'role-admin')
  service.grantPermission('role-admin', 'organization.unit.create')
  service.assignScope('user-001', 'company-001')

  // Authorized
  const authOk = await service.authorize('user-001', 'organization.unit.create', 'company-001')
  assert.equal(authOk.isOk, true)

  // Denied on different org scope
  const authWrongOrg = await service.authorize(
    'user-001',
    'organization.unit.create',
    'company-other'
  )
  assert.equal(authWrongOrg.isErr, true)
  if (authWrongOrg.isErr) {
    assert.equal(authWrongOrg.error.code, 'ACCESS_DENIED')
  }

  // Denied on different permission
  const authWrongPerm = await service.authorize('user-001', 'finance.post', 'company-001')
  assert.equal(authWrongPerm.isErr, true)
})

test('identity service rejects duplicate usernames', async () => {
  const service = new InMemoryIdentityService()
  const first = await service.registerLocalUser({
    id: 'user-001',
    username: 'bob',
    passwordHash: 'pw1',
    displayName: 'Bob 1',
  })
  assert.equal(first.isOk, true)

  const duplicate = await service.registerLocalUser({
    id: 'user-002',
    username: 'BOB',
    passwordHash: 'pw2',
    displayName: 'Bob 2',
  })
  assert.equal(duplicate.isErr, true)
  if (duplicate.isErr) {
    assert.equal(duplicate.error.code, 'IDENTITY_ALREADY_EXISTS')
  }
})
