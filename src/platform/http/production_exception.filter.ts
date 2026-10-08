import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { ORPCError } from '@orpc/server'

@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse()
    const parserType =
      exception && typeof exception === 'object' && 'type' in exception ? exception.type : undefined
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof ORPCError
          ? exception.status
          : parserType === 'entity.too.large'
            ? 413
            : parserType === 'entity.parse.failed'
              ? 400
              : parserType === 'charset.unsupported' || parserType === 'encoding.unsupported'
                ? 415
                : 500

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

    const error =
      exception instanceof ORPCError && status < 500
        ? exception
        : new ORPCError(codeForStatus(status), { status, defined: true })
    response.status(status).json(error.toJSON())
  }
}

function codeForStatus(status: number): string {
  return (
    (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        413: 'PAYLOAD_TOO_LARGE',
        415: 'UNSUPPORTED_MEDIA_TYPE',
        429: 'TOO_MANY_REQUESTS',
        503: 'SERVICE_UNAVAILABLE',
      } as Record<number, string>
    )[status] ?? 'INTERNAL_SERVER_ERROR'
  )
}
