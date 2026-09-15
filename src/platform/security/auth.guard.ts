import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Authenticator } from './authenticator.js'
import { PUBLIC_ROUTE_KEY } from './public.decorator.js'
import { readCookie, SESSION_COOKIE_NAME } from './session_cookie.js'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticator: Authenticator
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const header = request.headers?.authorization
    const token =
      typeof header === 'string' && /^Bearer\s+\S+$/i.test(header)
        ? header.slice(header.indexOf(' ') + 1).trim()
        : (readCookie(request.headers?.cookie, SESSION_COOKIE_NAME) ?? '')

    if (!token) throw new UnauthorizedException('Authentication required')

    const result = await this.authenticator.authenticate(token)
    if (result.isErr) throw new UnauthorizedException('Authentication required')

    request.user = result.value
    request.authToken = token
    request.authViaBearer = typeof header === 'string' && /^Bearer\s+\S+$/i.test(header)
    return true
  }
}
