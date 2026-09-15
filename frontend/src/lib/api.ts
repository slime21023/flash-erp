import type { ModuleManifest } from './types.js'

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const AUTH_STORAGE_KEY = 'flasherp.auth'
const SESSION_EXPIRED_EVENT = 'flasherp:session-expired'

export interface AuthenticatedUser {
  id: string
  username: string
  displayName: string
  isActive: boolean
  roles: string[]
  organizationUnitIds: string[]
}

export interface AuthSession {
  accessToken?: string
  expiresAt: string
  user: AuthenticatedUser
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  organizationUnitId?: string
}

export function readAuthSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as AuthSession
    if (!session.user || !session.expiresAt || new Date(session.expiresAt) <= new Date()) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return {
      ...session,
      user: {
        ...session.user,
        roles: session.user.roles ?? [],
        organizationUnitIds: session.user.organizationUnitIds ?? [],
      },
    }
  } catch {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
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

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const session = readAuthSession()
  const headers = new Headers({ Accept: 'application/json' })
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')

  const method = options.method ?? 'GET'
  if (method !== 'GET') {
    const csrf = csrfToken()
    if (csrf) headers.set('x-csrf-token', csrf)
  }

  const organizationUnitId = options.organizationUnitId ?? session?.user.organizationUnitIds[0]
  if (organizationUnitId) headers.set('x-org-unit-id', organizationUnitId)

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = payload.error ?? {}
    if (res.status === 401) clearAuthSession()
    throw new ApiError(res.status, error.code ?? 'HTTP_ERROR', error.message ?? res.statusText)
  }
  return (payload.data ?? payload) as T
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${API_BASE}/identity/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error?.message ?? '登入失敗')

  const session = payload.data ?? payload
  const normalized = {
    ...session,
    user: {
      ...session.user,
      roles: session.user.roles ?? [],
      organizationUnitIds: session.user.organizationUnitIds ?? [],
    },
  } as AuthSession
  const { accessToken: _accessToken, ...browserSession } = normalized
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(browserSession))
  return normalized
}

export async function restoreSession(): Promise<AuthSession | null> {
  const res = await fetch(`${API_BASE}/identity/session`, { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error('無法還原登入狀態')

  const payload = await res.json().catch(() => ({}))
  const user = (payload.data ?? payload) as AuthenticatedUser | null
  if (!user?.id) return null

  const existing = readAuthSession()
  const session: AuthSession = {
    expiresAt: existing?.expiresAt ?? new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    user: {
      ...user,
      roles: user.roles ?? [],
      organizationUnitIds: user.organizationUnitIds ?? [],
    },
  }
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  return session
}

export async function logout(): Promise<void> {
  const session = readAuthSession()
  try {
    if (session) {
      await fetch(`${API_BASE}/identity/logout`, {
        method: 'POST',
        headers: csrfToken() ? { 'x-csrf-token': csrfToken()! } : undefined,
        credentials: 'include',
      })
    }
  } finally {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
  }
}

export async function fetchModules(): Promise<{
  total: number
  modules: ModuleManifest[]
  all: ModuleManifest[]
}> {
  try {
    const res = await fetch(`${API_BASE}/api/system/modules`)
    if (!res.ok) {
      throw new Error(`Failed to fetch modules: ${res.statusText}`)
    }
    const data = await res.json()
    return data.data ?? data
  } catch (err) {
    console.warn('API fetch failed, falling back to local defaults:', err)
    return {
      total: 9,
      modules: [
        {
          id: 'organization',
          name: '企業組織架構 (Organization)',
          version: '1.0.0',
          summary: '支援多公司、多廠區、多倉儲組織樹狀管理與所有權隔離',
          category: 'System',
          author: 'FlashERP Core Team',
          dependsOn: [],
          installable: true,
          autoInstall: true,
          icon: 'Building2',
        },
        {
          id: 'identity',
          name: '身份認證與組織 RBAC (Identity & RBAC)',
          version: '1.0.0',
          summary: '本地帳號密碼雜湊認證、角色權限授權與組織權限作用域隔離',
          category: 'System',
          author: 'FlashERP Core Team',
          dependsOn: ['organization', 'audit'],
          installable: true,
          autoInstall: true,
          icon: 'ShieldCheck',
        },
        {
          id: 'audit',
          name: '不可變審計軌跡 (Audit Trail)',
          version: '1.0.0',
          summary: '基於領域事件監聽之全業務領域不可變操作日誌與變更稽核',
          category: 'System',
          author: 'FlashERP Core Team',
          dependsOn: ['identity'],
          installable: true,
          autoInstall: true,
          icon: 'History',
        },
        {
          id: 'finance',
          name: '財務會計總帳 (Finance & General Ledger)',
          version: '1.0.0',
          summary: '會計科目表、會計期間、傳票草稿與過帳、複式簿記平衡與即時試算表',
          category: 'Financials',
          author: 'FlashERP Core Team',
          dependsOn: ['organization'],
          installable: true,
          autoInstall: true,
          icon: 'BookOpen',
        },
        {
          id: 'inventory',
          name: '倉儲與庫存管理 (Inventory & ATP)',
          version: '1.0.0',
          summary: '料品主檔、倉儲庫位、庫存移動、移動加權平均成本、預留與可用量 (ATP)',
          category: 'Supply Chain',
          author: 'FlashERP Core Team',
          dependsOn: ['organization'],
          installable: true,
          autoInstall: true,
          icon: 'Boxes',
        },
        {
          id: 'procurement',
          name: '採購管理與三向匹配 (Procurement & 3-Way Match)',
          version: '1.0.0',
          summary: '請購 PR、採購 PO、收貨 GR、廠商發票、容差三向匹配與應付帳款 (AP) 傳票',
          category: 'Supply Chain',
          author: 'FlashERP Core Team',
          dependsOn: ['inventory', 'finance'],
          installable: true,
          autoInstall: true,
          icon: 'ShoppingCart',
        },
        {
          id: 'sales',
          name: '銷售管理與客戶信用 (Sales & Order-to-Cash)',
          version: '1.0.0',
          summary: '客戶主檔、動態信用管制、銷售訂單 SO、庫存預留、出庫履約與銷貨 AR/COGS 傳票',
          category: 'Supply Chain',
          author: 'FlashERP Core Team',
          dependsOn: ['inventory', 'finance'],
          installable: true,
          autoInstall: true,
          icon: 'BadgePercent',
        },
        {
          id: 'treasury',
          name: '出納資金與銀行對帳 (Treasury & Cash Management)',
          version: '1.0.0',
          summary: '銀行帳戶管理、收付款憑單、單據沖銷、銀行對帳單導入、規則對帳與調節表',
          category: 'Financials',
          author: 'FlashERP Core Team',
          dependsOn: ['finance'],
          installable: true,
          autoInstall: true,
          icon: 'Landmark',
        },
        {
          id: 'manufacturing',
          name: '生產製造與成本分攤 (Manufacturing & Costing - PP/CO)',
          version: '1.0.0',
          summary:
            'BOM 物料清單、防循環驗證、工單展算、領料發料在製品 (WIP) 結轉與月末製費零尾差分攤',
          category: 'Operations',
          author: 'FlashERP Core Team',
          dependsOn: ['inventory', 'finance'],
          installable: true,
          autoInstall: true,
          icon: 'Cog',
        },
      ],
      all: [],
    }
  }
}
