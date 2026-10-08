import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { requestIdFromHeader, runWithRequestContext } from './request_context.js'

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>
      user?: { id?: unknown }
    }>()
    const actorId =
      typeof request.user?.id === 'string' && request.user.id.trim()
        ? request.user.id.trim()
        : 'system'
    const requestId = requestIdFromHeader(request.headers?.['x-request-id'])
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader?: (name: string, value: string) => void }>()
    response.setHeader?.('x-request-id', requestId)

    const scopeHeader = request.headers?.['x-org-unit-id']
    const organizationUnitId =
      typeof scopeHeader === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(scopeHeader.trim())
        ? scopeHeader.trim()
        : undefined

    return new Observable((subscriber) =>
      runWithRequestContext({ actorId, requestId, organizationUnitId }, () =>
        next.handle().subscribe(subscriber)
      )
    )
  }
}
