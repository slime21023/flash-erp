import { createORPCClient, ORPCError } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { apiContract } from '../../../src/api_contract.js'
import { safeParse } from 'valibot'
import { browserSessionSchema } from '../../../src/modules/identity/contracts/identity_api_contract.js'

export { ORPCError }
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const AUTH_STORAGE_KEY = 'flasherp.auth'
const SESSION_EXPIRED_EVENT = 'flasherp:session-expired'

export interface ClientContext {
  organizationUnitId?: string
  requestId?: string
}

export type Api = JsonifiedClient<ContractRouterClient<typeof apiContract, ClientContext>>
export type AuthSession = Omit<Awaited<ReturnType<Api['identity']['login']>>, 'accessToken'>
export type AuthenticatedUser = AuthSession['user']

export function readAuthSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = safeParse(browserSessionSchema, JSON.parse(raw))
    if (!parsed.success) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    const session = parsed.output
    const expiresAt = Date.parse(session.expiresAt)
    if (!session.user || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return session
  } catch {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

function csrfToken(): string | undefined {
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('flash_erp_csrf='))
    ?.slice('flash_erp_csrf='.length)
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

const link = new OpenAPILink<ClientContext>(apiContract, {
  url: () => API_BASE || window.location.origin,
  headers: ({ context }) => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    const organizationUnitId =
      context?.organizationUnitId ?? readAuthSession()?.user.organizationUnitIds[0]
    if (organizationUnitId) headers['x-org-unit-id'] = organizationUnitId
    if (context?.requestId) headers['x-request-id'] = context.requestId
    return headers
  },
  fetch: async (request, init) => {
    const method = request.method.toUpperCase()
    const headers = new Headers(request.headers)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = csrfToken()
      if (csrf) headers.set('x-csrf-token', csrf)
    }
    const response = await fetch(request, { ...init, headers, credentials: 'include' })
    if (response.status === 401) clearAuthSession()
    return response
  },
})

export const api: Api = createORPCClient(link)

export async function login(username: string, password: string): Promise<AuthSession> {
  const { accessToken: _accessToken, ...session } = await api.identity.login({ username, password })
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  return session
}

export async function restoreSession(): Promise<AuthSession | null> {
  try {
    const user = await api.identity.session({})
    const session: AuthSession = {
      expiresAt:
        readAuthSession()?.expiresAt ?? new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      user,
    }
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    return session
  } catch (error) {
    if (error instanceof ORPCError && error.status === 401) return null
    throw error
  }
}

export async function logout(): Promise<void> {
  try {
    await api.identity.logout({})
  } finally {
    clearAuthSession()
  }
}

export function fetchModules() {
  return api.system.getModules({})
}
