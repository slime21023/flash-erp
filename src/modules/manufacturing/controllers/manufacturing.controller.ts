import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { ManufacturingContract } from '../contracts/index.js'
import { manufacturingApiContract } from '../contracts/manufacturing_api_contract.js'

@Controller()
export class ManufacturingController {
  constructor(private readonly manufacturing: ManufacturingContract) {}

  @RequirePermission('manufacturing.bom.create')
  @Implement(manufacturingApiContract.registerBom)
  registerBom() {
    return implement(manufacturingApiContract.registerBom).handler(async ({ input }) =>
      unwrapResult(
        await this.manufacturing.registerBom({
          ...input,
          baseQuantity: BigInt(input.baseQuantity),
          lines: input.lines.map((line) => ({
            ...line,
            quantityPerBase: BigInt(line.quantityPerBase),
          })),
        })
      )
    )
  }

  @RequirePermission('manufacturing.bom.read')
  @Implement(manufacturingApiContract.getBom)
  getBom() {
    return implement(manufacturingApiContract.getBom).handler(async ({ input }) =>
      unwrapResult(await this.manufacturing.getBom(input.id))
    )
  }

  @RequirePermission('manufacturing.order.create')
  @Implement(manufacturingApiContract.createWorkOrder)
  createWorkOrder() {
    return implement(manufacturingApiContract.createWorkOrder).handler(async ({ input }) =>
      unwrapResult(
        await this.manufacturing.createWorkOrder({
          ...input,
          targetQuantity: BigInt(input.targetQuantity),
        })
      )
    )
  }

  @RequirePermission('manufacturing.order.release')
  @Implement(manufacturingApiContract.releaseWorkOrder)
  releaseWorkOrder() {
    return implement(manufacturingApiContract.releaseWorkOrder).handler(async ({ input }) =>
      unwrapResult(await this.manufacturing.releaseWorkOrder(input.id))
    )
  }

  @RequirePermission('manufacturing.order.issue')
  @Implement(manufacturingApiContract.issueMaterials)
  issueMaterials() {
    return implement(manufacturingApiContract.issueMaterials).handler(async ({ input }) =>
      unwrapResult(
        await this.manufacturing.issueMaterials({
          workOrderId: input.id,
          issueDate: input.issueDate,
          lines: input.lines.map((line) => ({ ...line, quantity: BigInt(line.quantity) })),
        })
      )
    )
  }

  @RequirePermission('manufacturing.order.complete')
  @Implement(manufacturingApiContract.completeWorkOrder)
  completeWorkOrder() {
    return implement(manufacturingApiContract.completeWorkOrder).handler(async ({ input }) =>
      unwrapResult(
        await this.manufacturing.completeWorkOrder({
          workOrderId: input.id,
          completedQuantity: BigInt(input.completedQuantity),
          completionDate: input.completionDate,
        })
      )
    )
  }

  @RequirePermission('manufacturing.order.read')
  @Implement(manufacturingApiContract.getWorkOrder)
  getWorkOrder() {
    return implement(manufacturingApiContract.getWorkOrder).handler(async ({ input }) =>
      unwrapResult(await this.manufacturing.getWorkOrder(input.id))
    )
  }

  @RequirePermission('manufacturing.overhead.allocate')
  @Implement(manufacturingApiContract.allocateOverhead)
  allocateOverhead() {
    return implement(manufacturingApiContract.allocateOverhead).handler(async ({ input }) =>
      unwrapResult(
        await this.manufacturing.allocateOverhead({
          ...input,
          totalPoolAmountMinorUnits: BigInt(input.totalPoolAmountMinorUnits),
        })
      )
    )
  }
}
