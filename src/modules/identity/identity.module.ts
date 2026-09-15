import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IdentityContract } from './contracts/index.js'
import { LocalUserEntity } from './entities/local_user.entity.js'
import { AuthSessionEntity } from './entities/auth_session.entity.js'
import { RoleEntity } from './entities/role.entity.js'
import { PermissionEntity } from './entities/permission.entity.js'
import { UserRoleEntity } from './entities/user_role.entity.js'
import { RolePermissionEntity } from './entities/role_permission.entity.js'
import { UserOrganizationScopeEntity } from './entities/user_organization_scope.entity.js'
import { TypeOrmIdentityService } from './services/typeorm_identity_service.js'
import { IdentityController } from './controllers/identity.controller.js'

import {
  Authenticator,
  AuthGuard,
  Authorizer,
  CsrfGuard,
  RbacGuard,
} from '@platform/security/index.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LocalUserEntity,
      AuthSessionEntity,
      RoleEntity,
      PermissionEntity,
      UserRoleEntity,
      RolePermissionEntity,
      UserOrganizationScopeEntity,
    ]),
  ],
  controllers: [IdentityController],
  providers: [
    {
      provide: IdentityContract,
      useClass: TypeOrmIdentityService,
    },
    {
      provide: Authorizer,
      useExisting: IdentityContract,
    },
    {
      provide: Authenticator,
      useExisting: IdentityContract,
    },
    AuthGuard,
    RbacGuard,
    CsrfGuard,
  ],
  exports: [IdentityContract, Authorizer, Authenticator, AuthGuard, RbacGuard, CsrfGuard],
})
export class IdentityModule {}
