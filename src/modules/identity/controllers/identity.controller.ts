import { Controller, Req, Res } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import type { Response } from 'express'
import { unwrapResult } from '@platform/http/result_adapter.js'
import {
  clearCsrfCookie,
  clearSessionCookie,
  csrfCookie,
  newCsrfToken,
  Public,
  RequirePermission,
  sessionCookie,
  type AuthenticatedPrincipal,
} from '@platform/security/index.js'
import { IdentityContract } from '../contracts/index.js'
import { identityApiContract } from '../contracts/identity_api_contract.js'

@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityContract) {}

  @Public()
  @Implement(identityApiContract.login)
  login(@Res() response: Response) {
    return implement(identityApiContract.login).handler(async ({ input }) => {
      const result = await this.identity.login(input)
      if (result.isOk) {
        response.setHeader('Set-Cookie', [
          sessionCookie(result.value.accessToken),
          csrfCookie(newCsrfToken()),
        ])
      }
      return unwrapResult(result)
    })
  }

  @Implement(identityApiContract.session)
  session(@Req() request: { user: AuthenticatedPrincipal }) {
    return implement(identityApiContract.session).handler(() => ({
      ...request.user,
      roles: [...request.user.roles],
      organizationUnitIds: [...request.user.organizationUnitIds],
    }))
  }

  @RequirePermission('identity.user.create')
  @Implement(identityApiContract.register)
  register() {
    return implement(identityApiContract.register).handler(async ({ input }) =>
      unwrapResult(await this.identity.registerLocalUser(input))
    )
  }

  @Implement(identityApiContract.logout)
  logout(@Req() request: { authToken: string }, @Res() response: Response) {
    return implement(identityApiContract.logout).handler(async () => {
      const result = await this.identity.logout(request.authToken)
      response.setHeader('Set-Cookie', [clearSessionCookie(), clearCsrfCookie()])
      return unwrapResult(result)
    })
  }
}
