import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CsrfGuard } from '@platform/security/csrf.guard.js'
import {
  csrfCookie,
  CSRF_COOKIE_NAME,
  readCookie,
  sessionCookie,
  SESSION_COOKIE_NAME,
} from '@platform/security/session_cookie.js'

test('session cookies are HttpOnly and cookie parsing handles encoded values', () => {
  const session = sessionCookie('token.value')
  const csrf = csrfCookie('csrf.value')
  const header = `${session}; ${csrf}`

  assert.equal(readCookie(header, SESSION_COOKIE_NAME), 'token.value')
  assert.equal(readCookie(header, CSRF_COOKIE_NAME), 'csrf.value')
  assert.match(session, /HttpOnly/)
  assert.doesNotMatch(csrf, /HttpOnly/)
  assert.match(session, /SameSite=Lax/)
})

test('CSRF guard validates browser cookie writes and bypasses bearer clients', () => {
  const guard = new CsrfGuard(new Reflector())
  const context = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any

  const valid = `flash_erp_session=session; flash_erp_csrf=csrf`
  assert.equal(
    guard.canActivate(
      context({
        method: 'POST',
        headers: { cookie: valid, 'x-csrf-token': 'csrf' },
        authViaBearer: false,
      })
    ),
    true
  )

  assert.throws(
    () =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { cookie: valid, 'x-csrf-token': 'wrong' },
          authViaBearer: false,
        })
      ),
    ForbiddenException
  )

  assert.equal(
    guard.canActivate(
      context({
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        authViaBearer: true,
      })
    ),
    true
  )
})
