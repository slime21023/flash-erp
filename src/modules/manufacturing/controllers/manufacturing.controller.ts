import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { ManufacturingContract } from '../contracts/index.js'
import {
  AllocateOverheadDto,
  CompleteWorkOrderDto,
  CreateWorkOrderDto,
  IssueMaterialsDto,
  RegisterBomDto,
} from '../dto/manufacturing_dto.js'

@Controller('manufacturing')
export class ManufacturingController {
  constructor(private readonly manufacturing: ManufacturingContract) {}

  @RequirePermission('manufacturing.bom.create')
  @Post('boms')
  async registerBom(@Body() dto: RegisterBomDto, @Res() res: Response) {
    const result = await this.manufacturing.registerBom({
      id: dto.id,
      companyId: dto.companyId,
      code: dto.code,
      name: dto.name,
      parentItemId: dto.parentItemId,
      baseQuantity: dto.baseQuantity ? BigInt(dto.baseQuantity) : 1n,
      lines: dto.lines.map((l) => ({
        componentItemId: l.componentItemId,
        quantityPerBase: BigInt(l.quantityPerBase),
        scrapPercentageBasisPoints: l.scrapPercentageBasisPoints,
        memo: l.memo,
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('manufacturing.bom.read')
  @Get('boms/:id')
  async getBom(@Param('id') id: string, @Res() res: Response) {
    const result = await this.manufacturing.getBom(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('manufacturing.order.create')
  @Post('work-orders')
  async createWorkOrder(@Body() dto: CreateWorkOrderDto, @Res() res: Response) {
    const result = await this.manufacturing.createWorkOrder({
      id: dto.id,
      companyId: dto.companyId,
      workOrderNumber: dto.workOrderNumber,
      bomId: dto.bomId,
      outputWarehouseId: dto.outputWarehouseId,
      rawMaterialWarehouseId: dto.rawMaterialWarehouseId,
      targetQuantity: BigInt(dto.targetQuantity),
      memo: dto.memo,
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('manufacturing.order.release')
  @Post('work-orders/:id/release')
  async releaseWorkOrder(@Param('id') id: string, @Res() res: Response) {
    const result = await this.manufacturing.releaseWorkOrder(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('manufacturing.order.issue')
  @Post('work-orders/:id/issue-materials')
  async issueMaterials(
    @Param('id') id: string,
    @Body() dto: IssueMaterialsDto,
    @Res() res: Response
  ) {
    const result = await this.manufacturing.issueMaterials({
      workOrderId: id,
      issueDate: dto.issueDate,
      lines: dto.lines.map((l) => ({
        componentItemId: l.componentItemId,
        quantity: BigInt(l.quantity),
      })),
    })
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('manufacturing.order.complete')
  @Post('work-orders/:id/complete')
  async completeWorkOrder(
    @Param('id') id: string,
    @Body() dto: CompleteWorkOrderDto,
    @Res() res: Response
  ) {
    const result = await this.manufacturing.completeWorkOrder({
      workOrderId: id,
      completedQuantity: BigInt(dto.completedQuantity),
      completionDate: dto.completionDate,
    })
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('manufacturing.order.read')
  @Get('work-orders/:id')
  async getWorkOrder(@Param('id') id: string, @Res() res: Response) {
    const result = await this.manufacturing.getWorkOrder(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('manufacturing.overhead.allocate')
  @Post('overhead/allocate')
  async allocateOverhead(@Body() dto: AllocateOverheadDto, @Res() res: Response) {
    const result = await this.manufacturing.allocateOverhead({
      companyId: dto.companyId,
      overheadAccount: dto.overheadAccount,
      totalPoolAmountMinorUnits: BigInt(dto.totalPoolAmountMinorUnits),
      currency: dto.currency,
      accountingDate: dto.accountingDate,
      allocationBase: dto.allocationBase,
      workOrderIds: dto.workOrderIds,
    })
    return ResultPresenter.handle(res, result)
  }
}
