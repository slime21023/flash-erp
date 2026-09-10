import { Body, Controller, Param, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { AccountingPeriodContract } from '../contracts/index.js'
import { CreateAccountingPeriodDto } from '../dto/create_accounting_period.dto.js'

@Controller('finance/accounting-periods')
export class AccountingPeriodsController {
  constructor(private readonly period: AccountingPeriodContract) {}

  @RequirePermission('finance.period.create')
  @Post()
  async store(@Body() dto: CreateAccountingPeriodDto, @Res() res: Response) {
    const result = await this.period.create(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('finance.period.lock')
  @Post(':id/lock')
  async lock(@Param('id') id: string, @Res() res: Response) {
    const result = await this.period.lock(id)
    return ResultPresenter.handle(res, result)
  }
}
