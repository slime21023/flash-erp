import { SetMetadata } from '@nestjs/common'

export const REQUIRE_PERMISSION_KEY = 'REQUIRE_PERMISSION'
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission)
