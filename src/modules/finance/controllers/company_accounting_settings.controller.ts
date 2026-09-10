import { Body, Controller, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { CompanyAccountingSettingsContract } from '../contracts/index.js'
import { CompanyAccountingSettingsDto } from '../dto/company_accounting_settings.dto.js'

@Controller('finance/company-accounting-settings')
export class CompanyAccountingSettingsController {
  constructor(private readonly settings: CompanyAccountingSettingsContract) {}

  @RequirePermission('finance.settings.configure')
  @Post()
  async store(@Body() dto: CompanyAccountingSettingsDto, @Res() res: Response) {
    const result = await this.settings.configure(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }
}
