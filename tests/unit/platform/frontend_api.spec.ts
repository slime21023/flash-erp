/// <reference lib="dom" />
/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORPCError } from '@orpc/client'

const storageKey = 'flasherp.auth'
const principal = {
  id: 'manager-1',
  username: 'manager',
  displayName: 'Manager',
  isActive: true,
  roles: ['MANAGER'],
  organizationUnitIds: ['company-1'],
}
const cachedSession = () => ({
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  user: principal,
})
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('frontend oRPC transport', () => {
  const cache = new Map<string, string>()
  const dispatchEvent = vi.fn()
  const fetchMock = vi.fn<typeof fetch>()
  let client: typeof import('../../../frontend/src/lib/api.js')

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', '')
    cache.clear()
    dispatchEvent.mockReset()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => jsonResponse(principal))
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
      removeItem: (key: string) => cache.delete(key),
    })
    vi.stubGlobal('window', {
      location: { origin: 'https://erp.test' },
      dispatchEvent,
    })
    vi.stubGlobal('document', { cookie: 'other=value; flash_erp_csrf=csrf%2Ftoken' })
    vi.stubGlobal('fetch', fetchMock)
    client = await import('../../../frontend/src/lib/api.js')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  function sentRequest(index: number): Request {
    const call = fetchMock.mock.calls[index]
    if (!call) throw new Error(`Missing fetch call ${index}`)
    return new Request(call[0], call[1])
  }

  it('includes cookies on all requests and sends decoded CSRF only on unsafe methods', async () => {
    await client.api.identity.session({})
    const get = sentRequest(0)
    expect(get.method).toBe('GET')
    expect(get.credentials).toBe('include')
    expect(get.headers.has('x-csrf-token')).toBe(false)
    expect(new URL(get.url).pathname).toBe('/api/identity/session')

    fetchMock.mockImplementation(async () =>
      jsonResponse({ ...cachedSession(), accessToken: 'server-token' })
    )
    await client.api.identity.login({ username: 'manager', password: 'password' })
    const post = sentRequest(1)
    expect(post.method).toBe('POST')
    expect(post.credentials).toBe('include')
    expect(post.headers.get('x-csrf-token')).toBe('csrf/token')
    expect(await post.json()).toEqual({ username: 'manager', password: 'password' })
  })

  it('uses cached organization by default and keeps scope/request ID overrides local to a call', async () => {
    cache.set(storageKey, JSON.stringify(cachedSession()))
    await client.api.identity.session({})
    expect(sentRequest(0).headers.get('x-org-unit-id')).toBe('company-1')
    expect(sentRequest(0).headers.has('x-request-id')).toBe(false)

    await client.api.identity.session(
      {},
      { context: { organizationUnitId: 'company-2', requestId: 'trace-2' } }
    )
    expect(sentRequest(1).headers.get('x-org-unit-id')).toBe('company-2')
    expect(sentRequest(1).headers.get('x-request-id')).toBe('trace-2')

    await client.api.identity.session({})
    expect(sentRequest(2).headers.get('x-org-unit-id')).toBe('company-1')
    expect(sentRequest(2).headers.has('x-request-id')).toBe(false)
  })

  it.each(['UNAUTHORIZED', 'AUTHENTICATION_FAILED'])(
    'clears cached session and emits expiration on an oRPC %s 401 response',
    async (code) => {
      cache.set(storageKey, JSON.stringify(cachedSession()))
      fetchMock.mockImplementation(async () =>
        jsonResponse(new ORPCError(code, { status: 401, defined: true }).toJSON(), 401)
      )
      await expect(
        client.api.identity.login({ username: 'manager', password: 'wrong-password' })
      ).rejects.toMatchObject({ code, status: 401 })
      expect(cache.has(storageKey)).toBe(false)
      expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type: 'flasherp:session-expired' })
      )
    }
  )

  it('preserves an ADMIN session when PO approval requires an additional stage role', async () => {
    const cached = JSON.stringify({
      ...cachedSession(),
      user: { ...principal, roles: ['ADMIN'] },
    })
    cache.set(storageKey, cached)
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        new ORPCError('UNAUTHORIZED_APPROVER', { status: 403, defined: true }).toJSON(),
        403
      )
    )
    await expect(
      client.api.procurement.approvePO({ id: 'order-1', expectedStepId: 'mgr-review' })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED_APPROVER',
      status: 403,
      defined: true,
    })
    expect(cache.get(storageKey)).toBe(cached)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it.each([
    ['FORBIDDEN', 403],
    ['FINANCE_QUERY_ERROR', 422],
  ] as const)('preserves cached session for %s responses', async (code, status) => {
    const cached = JSON.stringify(cachedSession())
    cache.set(storageKey, cached)
    fetchMock.mockImplementation(async () =>
      jsonResponse(new ORPCError(code, { status, defined: true }).toJSON(), status)
    )
    await expect(client.api.identity.session({})).rejects.toMatchObject({ code, status })
    expect(cache.get(storageKey)).toBe(cached)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('stores login session metadata without persisting the access token', async () => {
    const session = cachedSession()
    const token = 'secret-server-access-token'
    fetchMock.mockImplementation(async () => jsonResponse({ ...session, accessToken: token }))
    expect(await client.login('manager', 'password')).toEqual(session)
    expect(JSON.parse(cache.get(storageKey) ?? '{}')).toEqual(session)
    expect(cache.get(storageKey)).not.toContain(token)
  })

  it('rejects malformed cached principals and expired sessions using the shared schema', () => {
    for (const user of [
      {},
      { ...principal, id: '' },
      { ...principal, roles: 'MANAGER' },
      { ...principal, organizationUnitIds: [{}] },
    ]) {
      cache.set(storageKey, JSON.stringify({ ...cachedSession(), user }))
      expect(client.readAuthSession()).toBeNull()
      expect(cache.has(storageKey)).toBe(false)
    }
    cache.set(
      storageKey,
      JSON.stringify({ ...cachedSession(), expiresAt: new Date(Date.now() - 1_000).toISOString() })
    )
    expect(client.readAuthSession()).toBeNull()
    expect(cache.has(storageKey)).toBe(false)
  })
})
