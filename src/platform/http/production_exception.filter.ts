import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'

@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse()
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    const body = exception instanceof HttpException ? exception.getResponse() : undefined

    if (status >= 500) {
      console.error(
        JSON.stringify({
          level: 'error',
          component: 'http',
          status,
          message: exception instanceof Error ? exception.message : String(exception),
        })
      )
    }

    response.status(status).json({
      error: {
        code: codeForStatus(status),
        message:
          status >= 500
            ? status === 503
              ? 'Service unavailable'
              : 'Internal server error'
            : safeMessage(body),
      },
    })
  }
}

function codeForStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_ERROR'
  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED'
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN'
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND'
  if (status === HttpStatus.CONFLICT) return 'CONFLICT'
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED'
  if (status === HttpStatus.SERVICE_UNAVAILABLE) return 'SERVICE_UNAVAILABLE'
  return 'INTERNAL_ERROR'
}

function safeMessage(body: string | object | undefined): string {
  if (typeof body === 'string') return body
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string') return message
    if (Array.isArray(message)) return 'Request validation failed'
  }
  return 'Request failed'
}
