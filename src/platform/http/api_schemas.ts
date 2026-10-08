import { oc } from '@orpc/contract'
import * as v from 'valibot'

export const idSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.check((value) => value.trim().length > 0)
)
export const currencySchema = v.pipe(v.string(), v.regex(/^[A-Z]{3}$/))
export const integerStringSchema = v.pipe(v.string(), v.regex(/^-?\d+$/))
export const unsignedIntegerStringSchema = v.pipe(v.string(), v.regex(/^\d+$/))

function validCalendarDate(value: string): boolean {
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

export const dateSchema = v.pipe(
  v.string(),
  v.isoDate(),
  v.check(validCalendarDate, 'Invalid calendar date')
)
export const timestampSchema = v.pipe(
  v.string(),
  v.isoTimestamp(),
  v.check(
    (value) => validCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)),
    'Invalid timestamp'
  )
)

export function statusForCode(code: string): number {
  if (code === 'INVALID_APPROVAL_STATE') return 500
  if (code === 'INVALID_APPROVAL_STEP') return 409
  if (code === 'UNAUTHORIZED_APPROVER') return 403
  if (code.endsWith('_NOT_FOUND')) return 404
  if (code.includes('UNAUTHORIZED') || code.includes('AUTHENTICATION')) return 401
  if (code.includes('FORBIDDEN') || code.includes('ACCESS_DENIED') || code === 'SCOPE_REQUIRED')
    return 403
  if (/CONFLICT|ALREADY_POSTED|ALREADY_EXISTS|ALREADY_REVERSED|DUPLICATE/.test(code)) return 409
  return 422
}

export function domainErrors<const T extends readonly string[]>(codes: T) {
  return Object.fromEntries(codes.map((code) => [code, { status: statusForCode(code) }])) as {
    [K in T[number]]: { status: number }
  }
}

export const apiBase = oc.errors({
  BAD_REQUEST: { status: 400 },
  UNAUTHORIZED: { status: 401 },
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404 },
  CONFLICT: { status: 409 },
  PAYLOAD_TOO_LARGE: { status: 413 },
  UNSUPPORTED_MEDIA_TYPE: { status: 415 },
  TOO_MANY_REQUESTS: { status: 429 },
  INTERNAL_SERVER_ERROR: { status: 500 },
  SERVICE_UNAVAILABLE: { status: 503 },
  SCOPE_FORBIDDEN: { status: 403 },
  SCOPE_REQUIRED: { status: 403 },
})
