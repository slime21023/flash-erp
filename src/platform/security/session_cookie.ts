import { randomBytes } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'flash_erp_session'
export const CSRF_COOKIE_NAME = 'flash_erp_csrf'
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

export function readCookie(header: unknown, name: string): string | undefined {
  if (typeof header !== 'string') return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

export function newCsrfToken(): string {
  return randomBytes(24).toString('base64url')
}

export function sessionCookie(token: string): string {
  return cookie(SESSION_COOKIE_NAME, token, SESSION_MAX_AGE_SECONDS, true)
}

export function csrfCookie(token: string): string {
  return cookie(CSRF_COOKIE_NAME, token, SESSION_MAX_AGE_SECONDS, false)
}

export function clearSessionCookie(): string {
  return cookie(SESSION_COOKIE_NAME, '', 0, true)
}

export function clearCsrfCookie(): string {
  return cookie(CSRF_COOKIE_NAME, '', 0, false)
}

function cookie(name: string, value: string, maxAge: number, httpOnly: boolean): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${httpOnly ? '; HttpOnly' : ''}${secure}`
}
