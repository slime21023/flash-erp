import { Body, Controller, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { InventoryContract } from '../contracts/index.js'
import { RegisterItemDto, RegisterUnitDto, RegisterWarehouseDto } from '../dto/inventory_dto.js'

@Controller('inventory')
export class InventoryMasterController {
  constructor(private readonly inventory: InventoryContract) {}

  @RequirePermission('inventory.master.write')
  @Post('units')
  async unit(@Body() dto: RegisterUnitDto, @Res() res: Response) {
    const result = await this.inventory.registerUnit(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('inventory.master.write')
  @Post('items')
  async item(@Body() dto: RegisterItemDto, @Res() res: Response) {
    const result = await this.inventory.registerItem(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('inventory.master.write')
  @Post('warehouses')
  async warehouse(@Body() dto: RegisterWarehouseDto, @Res() res: Response) {
    const result = await this.inventory.registerWarehouse(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }
}
