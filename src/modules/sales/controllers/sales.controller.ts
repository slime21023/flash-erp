import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { SalesContract } from '../contracts/index.js'
import { salesApiContract } from '../contracts/sales_api_contract.js'

@Controller()
export class SalesController {
  constructor(private readonly sales: SalesContract) {}

  @RequirePermission('sales.customer.create')
  @Implement(salesApiContract.registerCustomer)
  registerCustomer() {
    return implement(salesApiContract.registerCustomer).handler(async ({ input: dto }) => {
      const result = await this.sales.registerCustomer({
        id: dto.id,
        companyId: dto.companyId,
        code: dto.code,
        name: dto.name,
        paymentTerms: dto.paymentTerms || 'NET30',
        currency: dto.currency,
        creditLimitMinorUnits: BigInt(dto.creditLimitMinorUnits),
      })
      return unwrapResult(result)
    })
  }

  @RequirePermission('sales.customer.read')
  @Implement(salesApiContract.checkCredit)
  checkCredit() {
    return implement(salesApiContract.checkCredit).handler(
      async ({ input: { id: customerId, additionalAmount } }) => {
        const additional = additionalAmount ? BigInt(additionalAmount) : 0n
        const result = await this.sales.checkCustomerCredit(customerId, additional)
        return unwrapResult(result)
      }
    )
  }

  @RequirePermission('sales.customer.read')
  @Implement(salesApiContract.getCustomer)
  getCustomer() {
    return implement(salesApiContract.getCustomer).handler(async ({ input: { id } }) => {
      const result = await this.sales.getCustomer(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('sales.order.create')
  @Implement(salesApiContract.createSalesOrder)
  createSalesOrder() {
    return implement(salesApiContract.createSalesOrder).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('sales.order.read')
  @Implement(salesApiContract.getSalesOrder)
  getSalesOrder() {
    return implement(salesApiContract.getSalesOrder).handler(async ({ input: { id } }) => {
      const result = await this.sales.getSalesOrder(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('sales.order.approve')
  @Implement(salesApiContract.confirmOrder)
  confirmOrder() {
    return implement(salesApiContract.confirmOrder).handler(async ({ input: { id } }) => {
      const result = await this.sales.confirmSalesOrder(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('sales.shipment.create')
  @Implement(salesApiContract.createShipment)
  createShipment() {
    return implement(salesApiContract.createShipment).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }
}
