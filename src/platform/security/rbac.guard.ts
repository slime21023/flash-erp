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
    const userId = request.user?.id

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new UnauthorizedException('Authentication required')
    }

    const organizationUnitId = request.headers?.['x-org-unit-id']

    if (
      !organizationUnitId ||
      typeof organizationUnitId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(organizationUnitId.trim())
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
