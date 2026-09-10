import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { ProcurementContract } from '../contracts/index.js'
import {
  ApprovePurchaseRequisitionDto,
  ConvertRequisitionDto,
  CreateApVoucherDto,
  CreatePurchaseOrderDto,
  CreatePurchaseRequisitionDto,
  MatchVendorInvoiceDto,
  ReceiveGoodsDto,
  RegisterSupplierDto,
  RegisterVendorInvoiceDto,
} from '../dto/procurement_dto.js'

@Controller('procurement')
export class ProcurementController {
  constructor(private readonly procurement: ProcurementContract) {}

  @RequirePermission('procurement.supplier.create')
  @Post('suppliers')
  async registerSupplier(@Body() dto: RegisterSupplierDto, @Res() res: Response) {
    const result = await this.procurement.registerSupplier(dto)
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('procurement.order.create')
  @Post('purchase-orders')
  async createPO(@Body() dto: CreatePurchaseOrderDto, @Res() res: Response) {
    const result = await this.procurement.createPurchaseOrder({
      id: dto.id,
      companyId: dto.companyId,
      supplierId: dto.supplierId,
      number: dto.number,
      lines: dto.lines.map((l) => ({
        itemId: l.itemId,
        orderedQuantity: BigInt(l.orderedQuantity),
        unitCostMinorUnits: BigInt(l.unitCostMinorUnits),
        currency: l.currency,
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('procurement.order.approve')
  @Post('purchase-orders/:id/approve')
  async approvePO(@Param('id') id: string, @Res() res: Response) {
    const result = await this.procurement.approvePurchaseOrder(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('procurement.goods.receive')
  @Post('goods-receipts')
  async receiveGoods(@Body() dto: ReceiveGoodsDto, @Res() res: Response) {
    const result = await this.procurement.receiveGoods({
      id: dto.id,
      purchaseOrderId: dto.purchaseOrderId,
      warehouseId: dto.warehouseId,
      receivedAt: new Date(dto.receivedAt),
      lines: dto.lines?.map((l) => ({
        itemId: l.itemId,
        receivedQuantity: BigInt(l.receivedQuantity),
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('procurement.requisition.create')
  @Post('requisitions')
  async createRequisition(@Body() dto: CreatePurchaseRequisitionDto, @Res() res: Response) {
    const result = await this.procurement.createRequisition({
      id: dto.id,
      companyId: dto.companyId,
      requesterId: dto.requesterId,
      number: dto.number,
      memo: dto.memo,
      lines: dto.lines.map((l) => ({
        itemId: l.itemId,
        requestedQuantity: BigInt(l.requestedQuantity),
        estimatedCostMinorUnits: BigInt(l.estimatedCostMinorUnits),
        currency: l.currency,
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('procurement.requisition.submit')
  @Post('requisitions/:id/submit')
  async submitRequisition(@Param('id') id: string, @Res() res: Response) {
    const result = await this.procurement.submitRequisition(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('procurement.requisition.approve')
  @Post('requisitions/:id/approve')
  async approveRequisition(
    @Param('id') id: string,
    @Body() dto: ApprovePurchaseRequisitionDto,
    @Res() res: Response,
    @Req() request?: { user?: { id: string; roles?: readonly string[] } }
  ) {
    const result = await this.procurement.approveRequisition(id, {
      actorId: request?.user?.id ?? 'system-approver',
      roles: request ? (request.user?.roles ?? []) : ['MANAGER'],
      comment: dto.comment,
    })
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('procurement.requisition.convert')
  @Post('requisitions/:id/convert')
  async convertRequisition(
    @Param('id') id: string,
    @Body() dto: ConvertRequisitionDto,
    @Res() res: Response
  ) {
    const result = await this.procurement.convertRequisitionToPurchaseOrder(id, {
      purchaseOrderId: dto.purchaseOrderId,
      purchaseOrderNumber: dto.purchaseOrderNumber,
      supplierId: dto.supplierId,
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('procurement.invoice.create')
  @Post('invoices')
  async registerInvoice(@Body() dto: RegisterVendorInvoiceDto, @Res() res: Response) {
    const result = await this.procurement.registerVendorInvoice({
      id: dto.id,
      companyId: dto.companyId,
      supplierId: dto.supplierId,
      purchaseOrderId: dto.purchaseOrderId,
      invoiceNumber: dto.invoiceNumber,
      invoiceDate: dto.invoiceDate,
      currency: dto.currency,
      taxRateBasisPoints: dto.taxRateBasisPoints,
      lines: dto.lines.map((l) => ({
        itemId: l.itemId,
        invoicedQuantity: BigInt(l.invoicedQuantity),
        unitPriceMinorUnits: BigInt(l.unitPriceMinorUnits),
        lineTotalMinorUnits: BigInt(l.invoicedQuantity) * BigInt(l.unitPriceMinorUnits),
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('procurement.invoice.match')
  @Post('invoices/:id/match')
  async matchInvoice(
    @Param('id') id: string,
    @Body() dto: MatchVendorInvoiceDto,
    @Res() res: Response
  ) {
    const result = await this.procurement.matchVendorInvoice(id, {
      quantityToleranceBasisPoints: dto.quantityToleranceBasisPoints,
      priceToleranceBasisPoints: dto.priceToleranceBasisPoints,
      amountToleranceMinorUnits: dto.amountToleranceMinorUnits
        ? BigInt(dto.amountToleranceMinorUnits)
        : undefined,
    })
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('procurement.invoice.voucher')
  @Post('invoices/:id/voucher')
  async createApVoucher(
    @Param('id') id: string,
    @Body() dto: CreateApVoucherDto,
    @Res() res: Response
  ) {
    const result = await this.procurement.createAccountsPayableVoucher({
      invoiceId: id,
      voucherId: dto.voucherId,
      voucherNumber: dto.voucherNumber,
      accountingDate: dto.accountingDate,
      inventoryAccountId: dto.inventoryAccountId,
      taxAccountId: dto.taxAccountId,
      payableAccountId: dto.payableAccountId,
      memo: dto.memo,
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }
}
