import { DomainError } from '@platform/fp/index.js'

export class InventoryMovementError extends DomainError {
  readonly code = 'INVENTORY_MOVEMENT_INVALID'
  constructor(message: string) {
    super(message)
  }
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK'
  constructor(
    readonly skuOrId: string,
    readonly requested: bigint,
    readonly available: bigint
  ) {
    super(`Insufficient stock for ${skuOrId}: requested ${requested}, available ${available}`)
  }
}
