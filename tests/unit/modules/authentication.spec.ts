import assert from 'node:assert/strict'
import { test } from 'vitest'
import { InMemoryIdentityService } from '@modules/identity/services/in_memory_identity_service.js'

test('local authentication issues, validates, and revokes opaque bearer tokens', async () => {
  const service = new InMemoryIdentityService()
  const registered = await service.registerLocalUser({
    id: 'user-auth',
    username: 'alice',
    password: 'correct horse battery staple',
    displayName: 'Alice',
  })
  assert.equal(registered.isOk, true)

  const wrongPassword = await service.login({ username: 'alice', password: 'wrong password' })
  assert.equal(wrongPassword.isErr, true)

  const login = await service.login({
    username: ' Alice ',
    password: 'correct horse battery staple',
  })
  assert.equal(login.isOk, true)
  if (login.isErr) return
  assert.equal(login.value.accessToken.length, 43)

  const authenticated = await service.authenticate(login.value.accessToken)
  assert.equal(authenticated.isOk, true)
  if (authenticated.isErr) return
  assert.equal(authenticated.value.id, 'user-auth')

  const loggedOut = await service.logout(login.value.accessToken)
  assert.equal(loggedOut.isOk, true)
  const afterLogout = await service.authenticate(login.value.accessToken)
  assert.equal(afterLogout.isErr, true)
})

test('local authentication temporarily blocks repeated failures', async () => {
  const service = new InMemoryIdentityService()
  await service.registerLocalUser({
    id: 'user-rate-limit',
    username: 'rate-limit',
    password: 'correct horse battery staple',
    displayName: 'Rate Limit',
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await service.login({ username: 'rate-limit', password: 'wrong password' })
    assert.equal(result.isErr, true)
  }

  const blocked = await service.login({
    username: 'rate-limit',
    password: 'correct horse battery staple',
  })
  assert.equal(blocked.isErr, true)
})
