import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import {
  InsufficientStockError,
  InventoryContract,
  InventoryMovementError,
} from '../contracts/index.js'
import type {
  InventoryAvailabilitySnapshot,
  InventoryItemInput,
  InventoryMovementInput,
  InventoryMovementSnapshot,
  InventoryStockSnapshot,
  InventoryUnitInput,
  InventoryWarehouseInput,
  StockReservationInput,
  StockReservationSnapshot,
} from '../contracts/index.js'

export class InMemoryInventoryService extends InventoryContract {
  readonly #units = new Map<string, InventoryUnitInput>()
  readonly #items = new Map<string, InventoryItemInput>()
  readonly #warehouses = new Map<string, InventoryWarehouseInput>()
  readonly #movements: InventoryMovementInput[] = []
  readonly #reservations = new Map<string, StockReservationSnapshot>()

  async availableStock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryAvailabilitySnapshot, InventoryMovementError>> {
    const stockRes = await this.stock(companyId, itemId, warehouseId, options)
    if (stockRes.isErr) return err(stockRes.error)

    const physicalQuantity = stockRes.value.quantity
    let reservedQuantity = 0n
    for (const r of this.#reservations.values()) {
      if (
        r.companyId === companyId &&
        r.itemId === itemId &&
        r.warehouseId === warehouseId &&
        r.status === 'ACTIVE'
      ) {
        reservedQuantity += r.quantity
      }
    }

    const availableQuantity =
      physicalQuantity >= reservedQuantity ? physicalQuantity - reservedQuantity : 0n

    return ok({
      companyId,
      itemId,
      warehouseId,
      physicalQuantity,
      reservedQuantity,
      availableQuantity,
    })
  }

  async reserve(
    input: StockReservationInput,
    options?: TransactionOptions
  ): Promise<Result<StockReservationSnapshot, InventoryMovementError | InsufficientStockError>> {
    if (input.quantity <= 0n) {
      return err(new InventoryMovementError('Reservation quantity must be positive'))
    }

    const availRes = await this.availableStock(
      input.companyId,
      input.itemId,
      input.warehouseId,
      options
    )
    if (availRes.isErr) return err(availRes.error)

    if (input.quantity > availRes.value.availableQuantity) {
      return err(
        new InsufficientStockError(input.itemId, input.quantity, availRes.value.availableQuantity)
      )
    }

    const reservation: StockReservationSnapshot = Object.freeze({
      id: input.id,
      companyId: input.companyId,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      status: 'ACTIVE',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      createdAt: new Date(),
    })

    this.#reservations.set(input.id, reservation)
    return ok(reservation)
  }

  async releaseReservation(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<void, InventoryMovementError>> {
    const reservation = this.#reservations.get(id)
    if (reservation && reservation.status === 'ACTIVE') {
      this.#reservations.set(id, { ...reservation, status: 'RELEASED' })
    }
    return ok(undefined)
  }

  async registerUnit(
    input: InventoryUnitInput,
    _options?: TransactionOptions
  ): Promise<Result<InventoryUnitInput, InventoryMovementError>> {
    const id = input.id.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !code || !name) {
      return err(new InventoryMovementError('Unit id, code, and name are required'))
    }

    this.#units.set(id, { id, code, name })
    return ok({ id, code, name })
  }

  async registerItem(
    input: InventoryItemInput,
    _options?: TransactionOptions
  ): Promise<Result<InventoryItemInput, InventoryMovementError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const sku = input.sku.trim().toUpperCase()
    const name = input.name.trim()
    const unitId = input.unitId.trim()

    if (!id || !companyId || !sku || !name || !unitId) {
      return err(new InventoryMovementError('Item fields are required'))
    }

    this.#items.set(id, { id, companyId, sku, name, unitId })
    return ok({ id, companyId, sku, name, unitId })
  }

  async registerWarehouse(
    input: InventoryWarehouseInput,
    _options?: TransactionOptions
  ): Promise<Result<InventoryWarehouseInput, InventoryMovementError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const organizationUnitId = input.organizationUnitId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !companyId || !organizationUnitId || !code || !name) {
      return err(new InventoryMovementError('Warehouse fields are required'))
    }

    this.#warehouses.set(id, { id, companyId, organizationUnitId, code, name })
    return ok({ id, companyId, organizationUnitId, code, name })
  }

  async stock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    _options?: TransactionOptions
  ): Promise<Result<InventoryStockSnapshot, InventoryMovementError>> {
    const movements = this.#movements.filter(
      (m) => m.companyId === companyId && m.itemId === itemId && m.warehouseId === warehouseId
    )

    let quantity = 0n
    let value = 0n
    let currency: string | null = null

    for (const m of movements) {
      if (currency && currency !== m.currency) {
        return err(new InventoryMovementError('Stock movements cannot mix currencies'))
      }
      currency = m.currency
      quantity += m.quantityDelta
      value += m.quantityDelta * m.unitCostMinorUnits
    }

    if (quantity < 0n || value < 0n) {
      return err(new InventoryMovementError('Stock cannot be negative'))
    }

    return ok({
      companyId,
      itemId,
      warehouseId,
      quantity,
      averageUnitCostMinorUnits: quantity === 0n ? 0n : value / quantity,
      currency,
    })
  }

  async recordMovement(
    input: InventoryMovementInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryMovementSnapshot, InventoryMovementError>> {
    if (!input.id.trim() || !input.sourceType.trim() || !input.sourceId.trim()) {
      return err(new InventoryMovementError('id, sourceType, and sourceId are required'))
    }

    if (
      !/^[A-Z]{3}$/.test(input.currency) ||
      input.unitCostMinorUnits < 0n ||
      input.quantityDelta === 0n
    ) {
      return err(new InventoryMovementError('currency and unit cost are invalid'))
    }

    if (this.#movements.some((m) => m.id === input.id)) {
      return err(new InventoryMovementError(`Movement already exists: ${input.id}`))
    }

    const before = await this.stock(input.companyId, input.itemId, input.warehouseId, options)
    if (before.isErr) return err(before.error)

    if (before.value.currency && before.value.currency !== input.currency) {
      return err(new InventoryMovementError('Movement currency must match stock currency'))
    }

    if (input.quantityDelta < 0n) {
      if (before.value.quantity + input.quantityDelta < 0n) {
        return err(new InventoryMovementError('Movement would make stock negative'))
      }
      if (input.unitCostMinorUnits !== before.value.averageUnitCostMinorUnits) {
        return err(new InventoryMovementError('Outbound movement must use moving average cost'))
      }
    }

    const item = this.#items.get(input.itemId)
    const warehouse = this.#warehouses.get(input.warehouseId)
    if (
      !item ||
      !warehouse ||
      item.companyId !== input.companyId ||
      warehouse.companyId !== input.companyId
    ) {
      return err(
        new InventoryMovementError('Item and warehouse must be active in the same company')
      )
    }

    this.#movements.push(input)
    return ok(input)
  }
}
