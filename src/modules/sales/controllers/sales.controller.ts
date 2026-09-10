import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { SalesContract } from '../contracts/index.js'
import { CreateSalesOrderDto, CreateShipmentDto, RegisterCustomerDto } from '../dto/sales_dto.js'

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesContract) {}

  @RequirePermission('sales.customer.create')
  @Post('customers')
  async registerCustomer(@Body() dto: RegisterCustomerDto, @Res() res: Response) {
    const result = await this.sales.registerCustomer({
      id: dto.id,
      companyId: dto.companyId,
      code: dto.code,
      name: dto.name,
      paymentTerms: dto.paymentTerms || 'NET30',
      currency: dto.currency,
      creditLimitMinorUnits: BigInt(dto.creditLimitMinorUnits),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @Get('customers/:id/credit-check')
  async checkCredit(
    @Param('id') customerId: string,
    @Query('additionalAmount') additionalAmount: string | undefined,
    @Res() res: Response
  ) {
    const additional = additionalAmount ? BigInt(additionalAmount) : 0n
    const result = await this.sales.checkCustomerCredit(customerId, additional)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('sales.order.create')
  @Post('orders')
  async createSalesOrder(@Body() dto: CreateSalesOrderDto, @Res() res: Response) {
    const result = await this.sales.createSalesOrder({
      id: dto.id,
      companyId: dto.companyId,
      customerId: dto.customerId,
      number: dto.number,
      memo: dto.memo,
      taxRateBasisPoints: dto.taxRateBasisPoints,
      lines: dto.lines.map((l) => ({
        itemId: l.itemId,
        warehouseId: l.warehouseId,
        orderedQuantity: BigInt(l.orderedQuantity),
        unitPriceMinorUnits: BigInt(l.unitPriceMinorUnits),
        currency: l.currency,
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('sales.order.approve')
  @Post('orders/:id/confirm')
  async confirmOrder(@Param('id') id: string, @Res() res: Response) {
    const result = await this.sales.confirmSalesOrder(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('sales.shipment.create')
  @Post('shipments')
  async createShipment(@Body() dto: CreateShipmentDto, @Res() res: Response) {
    const result = await this.sales.createShipment({
      id: dto.id,
      salesOrderId: dto.salesOrderId,
      warehouseId: dto.warehouseId,
      shipmentDate: dto.shipmentDate,
      arVoucherId: dto.arVoucherId,
      cogsVoucherId: dto.cogsVoucherId,
      lines: dto.lines?.map((l) => ({
        itemId: l.itemId,
        shippedQuantity: BigInt(l.shippedQuantity),
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }
}
