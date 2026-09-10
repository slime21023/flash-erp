import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Authorizer } from './authorizer.js'
import { REQUIRE_PERMISSION_KEY } from './require_permission.decorator.js'

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizer: Authorizer
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    )

    if (!requiredPermission) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    // AuthGuard runs first in the application. The header fallback keeps this guard
    // independently testable and is ignored once an authenticated principal exists.
    const userId =
      request.user?.id ??
      (request.authToken === undefined ? request.headers?.['x-user-id'] : undefined)

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new UnauthorizedException('Authentication required')
    }

    const organizationUnitId =
      request.headers?.['x-org-unit-id'] ??
      request.params?.organizationUnitId ??
      request.params?.orgUnitId ??
      request.body?.organizationUnitId ??
      request.body?.companyId ??
      request.query?.organizationUnitId ??
      request.query?.companyId

    if (
      !organizationUnitId ||
      typeof organizationUnitId !== 'string' ||
      organizationUnitId.trim().length === 0
    ) {
      throw new ForbiddenException('Organization unit scope required for permission authorization')
    }

    const authResult = await this.authorizer.authorize(
      userId.trim(),
      requiredPermission,
      organizationUnitId.trim()
    )

    if (authResult.isErr) {
      throw new ForbiddenException(authResult.error.message)
    }

    return true
  }
}
