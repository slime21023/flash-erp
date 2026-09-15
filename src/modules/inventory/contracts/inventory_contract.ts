import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type { ScopeForbiddenError } from '@platform/security/index.js'
import type { InsufficientStockError, InventoryMovementError } from './inventory_errors.js'

export type InventoryMovementInput = Readonly<{
  id: string
  companyId: string
  itemId: string
  warehouseId: string
  sourceType: string
  sourceId: string
  quantityDelta: bigint
  unitCostMinorUnits: bigint
  currency: string
  occurredAt: Date
}>

export type InventoryMovementSnapshot = Readonly<InventoryMovementInput>

export type InventoryStockSnapshot = Readonly<{
  companyId: string
  itemId: string
  warehouseId: string
  quantity: bigint
  averageUnitCostMinorUnits: bigint
  currency: string | null
}>

export type StockReservationInput = Readonly<{
  id: string
  companyId: string
  itemId: string
  warehouseId: string
  quantity: bigint
  referenceType: string
  referenceId: string
}>

export type StockReservationSnapshot = Readonly<{
  id: string
  companyId: string
  itemId: string
  warehouseId: string
  quantity: bigint
  status: 'ACTIVE' | 'RELEASED' | 'FULFILLED'
  referenceType: string
  referenceId: string
  createdAt: Date
}>

export type InventoryAvailabilitySnapshot = Readonly<{
  companyId: string
  itemId: string
  warehouseId: string
  physicalQuantity: bigint
  reservedQuantity: bigint
  availableQuantity: bigint
}>

export type InventoryUnitInput = Readonly<{ id: string; code: string; name: string }>
export type InventoryItemInput = Readonly<{
  id: string
  companyId: string
  sku: string
  name: string
  unitId: string
}>
export type InventoryWarehouseInput = Readonly<{
  id: string
  companyId: string
  organizationUnitId: string
  code: string
  name: string
}>

/** Public cross-module boundary for immutable stock movements and reservations. */
export abstract class InventoryContract {
  abstract registerUnit(
    input: InventoryUnitInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryUnitInput, InventoryMovementError | ScopeForbiddenError>>
  abstract registerItem(
    input: InventoryItemInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryItemInput, InventoryMovementError | ScopeForbiddenError>>
  abstract registerWarehouse(
    input: InventoryWarehouseInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryWarehouseInput, InventoryMovementError | ScopeForbiddenError>>
  abstract findItem(
    companyId: string,
    itemId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryItemInput, InventoryMovementError | ScopeForbiddenError>>
  abstract findWarehouse(
    companyId: string,
    warehouseId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryWarehouseInput, InventoryMovementError | ScopeForbiddenError>>
  abstract recordMovement(
    input: InventoryMovementInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryMovementSnapshot, InventoryMovementError | ScopeForbiddenError>>
  abstract stock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryStockSnapshot, InventoryMovementError | ScopeForbiddenError>>
  abstract reserve(
    input: StockReservationInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      StockReservationSnapshot,
      InventoryMovementError | InsufficientStockError | ScopeForbiddenError
    >
  >
  abstract releaseReservation(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<void, InventoryMovementError | ScopeForbiddenError>>
  abstract consumeReservation(
    id: string,
    quantity: bigint,
    options?: TransactionOptions
  ): Promise<
    Result<
      StockReservationSnapshot,
      InventoryMovementError | InsufficientStockError | ScopeForbiddenError
    >
  >
  abstract availableStock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryAvailabilitySnapshot, InventoryMovementError | ScopeForbiddenError>>
}
