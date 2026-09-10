import type { ModuleManifest } from './types.js'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'
const AUTH_STORAGE_KEY = 'flasherp.auth'

export interface AuthenticatedUser {
  id: string
  username: string
  displayName: string
  isActive: boolean
  roles: string[]
}

export interface AuthSession {
  accessToken: string
  expiresAt: string
  user: AuthenticatedUser
}

export function readAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as AuthSession
    if (!session.accessToken || new Date(session.expiresAt) <= new Date()) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return session
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${API_BASE}/identity/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error?.message ?? '登入失敗')

  const session = payload.data ?? payload
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  return session as AuthSession
}

export async function logout(): Promise<void> {
  const session = readAuthSession()
  try {
    if (session) {
      await fetch(`${API_BASE}/identity/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
    }
  } finally {
    localStorage.removeItem(AUTH_STORAGE_KEY)
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
          dependsOn: ['organization'],
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
