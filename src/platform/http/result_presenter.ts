import { DomainError } from '../fp/index.js'
import type { Result } from '../fp/index.js'

export type PresenterOptions = {
  successStatus?: 200 | 201 | 204
  statusOverrides?: Record<string, number>
}

export type PresenterContext =
  | { response: any }
  | {
      status: (code: number) => any
      send?: (body: unknown) => any
      json?: (body: unknown) => any
      ok?: (body: unknown) => any
      created?: (body: unknown) => any
      noContent?: () => any
    }

export function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(serializeBigInt)
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const serialized: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      serialized[key] = serializeBigInt(val)
    }
    return serialized
  }
  return value
}

export class ResultPresenter {
  static handle<T, E>(context: PresenterContext, result: Result<T, E>, options?: PresenterOptions) {
    const res = 'response' in context ? context.response : context

    if (result.isOk) {
      const payload = serializeBigInt(result.value)
      const status = options?.successStatus ?? 200

      if (typeof res.status === 'function') {
        const chain = res.status(status)
        if (chain && typeof chain.send === 'function') return chain.send(payload)
        if (chain && typeof chain.json === 'function') return chain.json(payload)
      }
      if (status === 201 && typeof res.created === 'function') return res.created(payload)
      if (status === 204 && typeof res.noContent === 'function') return res.noContent()
      if (typeof res.ok === 'function') return res.ok(payload)

      return payload
    }

    const error = result.error
    const status = ResultPresenter.statusFor(error, options?.statusOverrides)
    const body = {
      error: ResultPresenter.bodyFor(error),
    }

    if (typeof res.status === 'function') {
      const chained = res.status(status)
      if (chained && typeof chained.send === 'function') {
        return chained.send(body)
      }
      if (chained && typeof chained.json === 'function') {
        return chained.json(body)
      }
      if (typeof res.send === 'function') {
        return res.send(body)
      }
    }

    return body
  }

  static statusFor(error: unknown, overrides?: Record<string, number>): number {
    if (!(error instanceof DomainError)) {
      return 500
    }

    if (overrides && overrides[error.code] !== undefined) {
      return overrides[error.code] as number
    }

    if (error.code.endsWith('_NOT_FOUND')) {
      return 404
    }

    if (error.code.includes('UNAUTHORIZED') || error.code.includes('AUTHENTICATION')) {
      return 401
    }

    if (error.code.includes('FORBIDDEN') || error.code.includes('ACCESS_DENIED')) {
      return 403
    }

    if (
      error.code.includes('CONFLICT') ||
      error.code.includes('ALREADY_POSTED') ||
      error.code.includes('ALREADY_EXISTS') ||
      error.code.includes('ALREADY_REVERSED') ||
      error.code.includes('DUPLICATE')
    ) {
      return 409
    }

    return 422
  }

  static bodyFor(error: unknown): { code: string; message: string } {
    if (error instanceof DomainError) {
      return { code: error.code, message: error.message }
    }

    return { code: 'INTERNAL_ERROR', message: 'Internal server error' }
  }
}
