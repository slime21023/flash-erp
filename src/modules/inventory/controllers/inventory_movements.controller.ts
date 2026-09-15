import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { InventoryContract } from '../contracts/index.js'
import { RecordMovementDto } from '../dto/inventory_dto.js'

@Controller('inventory')
export class InventoryMovementsController {
  constructor(private readonly inventory: InventoryContract) {}

  @RequirePermission('inventory.movement.record')
  @Post('movements')
  async store(@Body() dto: RecordMovementDto, @Res() res: Response) {
    const result = await this.inventory.recordMovement({
      id: dto.id,
      companyId: dto.companyId,
      itemId: dto.itemId,
      warehouseId: dto.warehouseId,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      quantityDelta: BigInt(dto.quantityDelta),
      unitCostMinorUnits: BigInt(dto.unitCostMinorUnits),
      currency: dto.currency,
      occurredAt: new Date(dto.occurredAt),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('inventory.stock.read')
  @Get('stock')
  async showStock(
    @Query('companyId') companyId: string,
    @Query('itemId') itemId: string,
    @Query('warehouseId') warehouseId: string,
    @Res() res: Response
  ) {
    const result = await this.inventory.stock(companyId || '', itemId || '', warehouseId || '')
    return ResultPresenter.handle(res, result)
  }
}
