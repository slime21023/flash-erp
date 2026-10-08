import { ORPCError } from '@orpc/server'
import { DomainError, type Result } from '../fp/index.js'
import { statusForCode } from './api_schemas.js'

export type ApiValue<T> = T extends bigint | Date
  ? string
  : T extends readonly (infer U)[]
    ? ApiValue<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: ApiValue<T[K]> }
      : T

export function serializeApiValue<T>(value: T): ApiValue<T> {
  if (typeof value === 'bigint') return value.toString() as ApiValue<T>
  if (value instanceof Date) return value.toISOString() as ApiValue<T>
  if (Array.isArray(value)) return value.map(serializeApiValue) as ApiValue<T>
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeApiValue(item)])
    ) as ApiValue<T>
  }
  return value as ApiValue<T>
}

function publicErrorData(error: DomainError): unknown {
  if (
    (error.code === 'CREDIT_LIMIT_EXCEEDED' || error.code === 'MATCHING_TOLERANCE_EXCEEDED') &&
    'details' in error
  ) {
    return serializeApiValue(error.details)
  }
  const fields =
    error.code === 'INSUFFICIENT_STOCK'
      ? ['skuOrId', 'requested', 'available']
      : error.code === 'INSUFFICIENT_FUNDS'
        ? ['accountId', 'currentBalanceMinorUnits', 'requestedAmountMinorUnits']
        : []
  if (!fields.length) return undefined
  return serializeApiValue(
    Object.fromEntries(
      fields.map((key) => [key, (error as unknown as Record<string, unknown>)[key]])
    )
  )
}

export function unwrapResult<T, E>(result: Result<T, E>): ApiValue<T> {
  if (result.isOk) return serializeApiValue(result.value)
  const error = result.error
  if (error instanceof DomainError) {
    throw new ORPCError(error.code, {
      status: statusForCode(error.code),
      message: error.message,
      data: publicErrorData(error),
      cause: error,
    })
  }
  throw new ORPCError('INTERNAL_SERVER_ERROR', { cause: error })
}
