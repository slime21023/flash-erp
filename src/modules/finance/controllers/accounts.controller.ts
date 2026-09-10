import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { AccountContract } from '../contracts/index.js'
import { CreateAccountDto } from '../dto/create_account.dto.js'

@Controller('finance/accounts')
export class AccountsController {
  constructor(private readonly account: AccountContract) {}

  @RequirePermission('finance.account.create')
  @Post()
  async store(@Body() dto: CreateAccountDto, @Res() res: Response) {
    const result = await this.account.create(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @Get(':id')
  async show(@Param('id') id: string, @Res() res: Response) {
    const result = await this.account.find(id)
    return ResultPresenter.handle(res, result)
  }
}
