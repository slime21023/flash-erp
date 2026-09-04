import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'

type PresenterContext = Pick<HttpContext, 'response'>

export type PresenterOptions = {
  successStatus?: 200 | 201 | 204
  statusOverrides?: Record<string, number>
}

export class ResultPresenter {
  static handle<T, E>(context: PresenterContext, result: Result<T, E>, options?: PresenterOptions) {
    if (result.isOk) {
      if (options?.successStatus === 201) {
        return context.response.created(result.value)
      }
      if (options?.successStatus === 204) {
        return context.response.noContent()
      }
      return context.response.ok(result.value)
    }

    const error = result.error
    const status = ResultPresenter.statusFor(error, options?.statusOverrides)
    return context.response.status(status).send({
      error: ResultPresenter.bodyFor(error),
    })
  }

  private static statusFor(error: unknown, overrides?: Record<string, number>): number {
    if (!(error instanceof DomainError)) {
      return 500
    }

    if (overrides && overrides[error.code] !== undefined) {
      return overrides[error.code] as number
    }

    if (error.code.endsWith('_NOT_FOUND')) {
      return 404
    }

    if (error.code.includes('UNAUTHORIZED')) {
      return 401
    }

    if (error.code.includes('FORBIDDEN')) {
      return 403
    }

    if (
      error.code.includes('CONFLICT') ||
      error.code.includes('ALREADY_POSTED') ||
      error.code.includes('ALREADY_EXISTS') ||
      error.code.includes('DUPLICATE')
    ) {
      return 409
    }

    return 422
  }

  private static bodyFor(error: unknown): { code: string; message: string } {
    if (error instanceof DomainError) {
      return { code: error.code, message: error.message }
    }

    return { code: 'INTERNAL_ERROR', message: 'Internal server error' }
  }
}
