import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { OrganizationContract } from '../contracts/index.js'
import { RegisterOrganizationUnitDto } from '../dto/register_organization_unit.dto.js'

@Controller('organization/units')
export class OrganizationUnitsController {
  constructor(private readonly organization: OrganizationContract) {}

  @RequirePermission('organization.unit.create')
  @Post()
  async register(@Body() dto: RegisterOrganizationUnitDto, @Res() res: Response) {
    const result = await this.organization.registerUnit(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @Get(':id')
  async find(@Param('id') id: string, @Res() res: Response) {
    const result = await this.organization.findUnit(id)
    return ResultPresenter.handle(res, result)
  }
}
