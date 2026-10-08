import { Controller, Req } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import type { AuthenticatedPrincipal } from '@platform/security/authenticator.js'
import { ProcurementContract } from '../contracts/index.js'
import { procurementApiContract } from '../contracts/procurement_api_contract.js'

@Controller()
export class ProcurementController {
  constructor(private readonly procurement: ProcurementContract) {}

  @RequirePermission('procurement.supplier.create')
  @Implement(procurementApiContract.registerSupplier)
  registerSupplier() {
    return implement(procurementApiContract.registerSupplier).handler(async ({ input: dto }) => {
      const result = await this.procurement.registerSupplier(dto)
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.order.create')
  @Implement(procurementApiContract.createPO)
  createPO() {
    return implement(procurementApiContract.createPO).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.order.approve')
  @Implement(procurementApiContract.approvePO)
  approvePO(@Req() request: { user: AuthenticatedPrincipal }) {
    return implement(procurementApiContract.approvePO).handler(async ({ input }) => {
      const { id, expectedStepId, comment } = input
      const result = await this.procurement.approvePurchaseOrder(id, {
        actorId: request.user.id,
        roles: request.user.roles,
        expectedStepId,
        comment,
      })
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.order.read')
  @Implement(procurementApiContract.getPO)
  getPO() {
    return implement(procurementApiContract.getPO).handler(async ({ input: { id } }) =>
      unwrapResult(await this.procurement.getPurchaseOrder(id))
    )
  }

  @RequirePermission('procurement.goods.receive')
  @Implement(procurementApiContract.receiveGoods)
  receiveGoods() {
    return implement(procurementApiContract.receiveGoods).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.requisition.create')
  @Implement(procurementApiContract.createRequisition)
  createRequisition() {
    return implement(procurementApiContract.createRequisition).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.requisition.submit')
  @Implement(procurementApiContract.submitRequisition)
  submitRequisition() {
    return implement(procurementApiContract.submitRequisition).handler(
      async ({ input: { id } }) => {
        const result = await this.procurement.submitRequisition(id)
        return unwrapResult(result)
      }
    )
  }

  @RequirePermission('procurement.requisition.approve')
  @Implement(procurementApiContract.approveRequisition)
  approveRequisition(@Req() request: { user: AuthenticatedPrincipal }) {
    return implement(procurementApiContract.approveRequisition).handler(async ({ input: dto }) => {
      const { id } = dto
      const result = await this.procurement.approveRequisition(id, {
        actorId: request.user.id,
        roles: request.user.roles,
        comment: dto.comment,
      })
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.requisition.convert')
  @Implement(procurementApiContract.convertRequisition)
  convertRequisition() {
    return implement(procurementApiContract.convertRequisition).handler(async ({ input: dto }) => {
      const { id } = dto
      const result = await this.procurement.convertRequisitionToPurchaseOrder(id, {
        purchaseOrderId: dto.purchaseOrderId,
        purchaseOrderNumber: dto.purchaseOrderNumber,
        supplierId: dto.supplierId,
      })
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.invoice.create')
  @Implement(procurementApiContract.registerInvoice)
  registerInvoice() {
    return implement(procurementApiContract.registerInvoice).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.invoice.match')
  @Implement(procurementApiContract.matchInvoice)
  matchInvoice() {
    return implement(procurementApiContract.matchInvoice).handler(async ({ input: dto }) => {
      const { id } = dto
      const result = await this.procurement.matchVendorInvoice(id, {
        quantityToleranceBasisPoints: dto.quantityToleranceBasisPoints,
        priceToleranceBasisPoints: dto.priceToleranceBasisPoints,
        amountToleranceMinorUnits: dto.amountToleranceMinorUnits
          ? BigInt(dto.amountToleranceMinorUnits)
          : undefined,
      })
      return unwrapResult(result)
    })
  }

  @RequirePermission('procurement.invoice.voucher')
  @Implement(procurementApiContract.createApVoucher)
  createApVoucher() {
    return implement(procurementApiContract.createApVoucher).handler(async ({ input: dto }) => {
      const { id } = dto
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
      return unwrapResult(result)
    })
  }
}
