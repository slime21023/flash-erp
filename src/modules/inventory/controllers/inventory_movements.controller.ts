import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { InventoryContract } from '../contracts/index.js'
import { inventoryApiContract } from '../contracts/inventory_api_contract.js'

@Controller()
export class InventoryMovementsController {
  constructor(private readonly inventory: InventoryContract) {}

  @RequirePermission('inventory.movement.record')
  @Implement(inventoryApiContract.movements.store)
  store() {
    return implement(inventoryApiContract.movements.store).handler(async ({ input }) =>
      unwrapResult(
        await this.inventory.recordMovement({
          ...input,
          quantityDelta: BigInt(input.quantityDelta),
          unitCostMinorUnits: BigInt(input.unitCostMinorUnits),
          occurredAt: new Date(input.occurredAt),
        })
      )
    )
  }

  @RequirePermission('inventory.stock.read')
  @Implement(inventoryApiContract.movements.showStock)
  showStock() {
    return implement(inventoryApiContract.movements.showStock).handler(async ({ input }) =>
      unwrapResult(await this.inventory.stock(input.companyId, input.itemId, input.warehouseId))
    )
  }
}
