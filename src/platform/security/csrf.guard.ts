import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PUBLIC_ROUTE_KEY } from './public.decorator.js'
import { CSRF_COOKIE_NAME, readCookie, SESSION_COOKIE_NAME } from './session_cookie.js'

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const method = String(request.method ?? 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true
    }

    // Bearer clients already present the credential outside the browser cookie channel.
    if (request.authViaBearer) return true

    const session = readCookie(request.headers?.cookie, SESSION_COOKIE_NAME)
    if (!session) return true

    const csrfCookie = readCookie(request.headers?.cookie, CSRF_COOKIE_NAME)
    const csrfHeader = request.headers?.['x-csrf-token']
    if (!csrfCookie || typeof csrfHeader !== 'string' || csrfCookie !== csrfHeader.trim()) {
      throw new ForbiddenException('CSRF validation failed')
    }
    return true
  }
}
