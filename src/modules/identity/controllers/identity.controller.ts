import { Body, Controller, Post, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { Public, RequirePermission } from '@platform/security/index.js'
import { IdentityContract } from '../contracts/index.js'
import { LoginDto } from '../dto/login.dto.js'
import { RegisterLocalUserDto } from '../dto/register_local_user.dto.js'

@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityContract) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.identity.login(dto)
    return ResultPresenter.handle(res, result, {
      statusOverrides: { AUTHENTICATION_FAILED: 401 },
    })
  }

  @RequirePermission('identity.user.create')
  @Post('users')
  async register(@Body() dto: RegisterLocalUserDto, @Res() res: Response) {
    const result = await this.identity.registerLocalUser(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @Post('logout')
  async logout(@Req() request: { authToken?: string }, @Res() res: Response) {
    const result = await this.identity.logout(request.authToken ?? '')
    return ResultPresenter.handle(res, result)
  }
}
