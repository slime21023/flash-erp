import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { InventoryContract } from '../contracts/index.js'
import { inventoryApiContract } from '../contracts/inventory_api_contract.js'

@Controller()
export class InventoryMasterController {
  constructor(private readonly inventory: InventoryContract) {}

  @RequirePermission('inventory.master.write')
  @Implement(inventoryApiContract.master.unit)
  unit() {
    return implement(inventoryApiContract.master.unit).handler(async ({ input }) =>
      unwrapResult(await this.inventory.registerUnit(input))
    )
  }

  @RequirePermission('inventory.master.write')
  @Implement(inventoryApiContract.master.item)
  item() {
    return implement(inventoryApiContract.master.item).handler(async ({ input }) =>
      unwrapResult(await this.inventory.registerItem(input))
    )
  }

  @RequirePermission('inventory.master.write')
  @Implement(inventoryApiContract.master.warehouse)
  warehouse() {
    return implement(inventoryApiContract.master.warehouse).handler(async ({ input }) =>
      unwrapResult(await this.inventory.registerWarehouse(input))
    )
  }
}
