import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type {
  BomAlreadyExistsError,
  BomNotFoundError,
  CyclicBomDependencyError,
  InvalidWorkOrderStateError,
  ManufacturingError,
  MaterialIssueQuantityExceededError,
  WorkOrderNotFoundError,
} from './manufacturing_errors.js'

export type BomLineInput = Readonly<{
  componentItemId: string
  quantityPerBase: bigint
  scrapPercentageBasisPoints?: number
  memo?: string
}>

export type BomLineSnapshot = Readonly<{
  componentItemId: string
  quantityPerBase: bigint
  scrapPercentageBasisPoints: number
  memo?: string
}>

export type RegisterBomInput = Readonly<{
  id: string
  companyId: string
  code: string
  name: string
  parentItemId: string
  baseQuantity?: bigint
  lines: readonly BomLineInput[]
}>

export type BomSnapshot = Readonly<{
  id: string
  companyId: string
  code: string
  name: string
  parentItemId: string
  baseQuantity: bigint
  lines: readonly BomLineSnapshot[]
}>

export type WorkOrderLineSnapshot = Readonly<{
  id: string
  componentItemId: string
  warehouseId: string
  plannedQuantity: bigint
  issuedQuantity: bigint
}>

export type CreateWorkOrderInput = Readonly<{
  id: string
  companyId: string
  workOrderNumber: string
  bomId: string
  outputWarehouseId: string
  rawMaterialWarehouseId: string
  targetQuantity: bigint
  memo?: string
}>

export type WorkOrderSnapshot = Readonly<{
  id: string
  companyId: string
  workOrderNumber: string
  bomId: string
  outputItemId: string
  outputWarehouseId: string
  rawMaterialWarehouseId: string
  targetQuantity: bigint
  completedQuantity: bigint
  status: 'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED'
  actualDirectMaterialCostMinorUnits: bigint
  allocatedOverheadCostMinorUnits: bigint
  totalCostMinorUnits: bigint
  unitCostMinorUnits: bigint
  lines: readonly WorkOrderLineSnapshot[]
  memo?: string
  completedAt?: Date
}>

export type IssueMaterialLineInput = Readonly<{
  componentItemId: string
  quantity: bigint
}>

export type IssueMaterialsInput = Readonly<{
  workOrderId: string
  issueDate: string
  lines: readonly IssueMaterialLineInput[]
}>

export type CompleteWorkOrderInput = Readonly<{
  workOrderId: string
  completedQuantity: bigint
  completionDate: string
}>

export type AllocateOverheadInput = Readonly<{
  companyId: string
  overheadAccount?: string
  totalPoolAmountMinorUnits: bigint
  currency?: string
  accountingDate: string
  allocationBase: 'COMPLETED_QUANTITY' | 'DIRECT_MATERIAL_COST'
  workOrderIds: readonly string[]
}>

export type OverheadAllocationDetail = Readonly<{
  workOrderId: string
  allocatedAmountMinorUnits: bigint
  newTotalCostMinorUnits: bigint
  newUnitCostMinorUnits: bigint
}>

export type OverheadAllocationSummary = Readonly<{
  companyId: string
  totalPoolAmountMinorUnits: bigint
  allocations: readonly OverheadAllocationDetail[]
}>

export abstract class ManufacturingContract {
  abstract registerBom(
    input: RegisterBomInput,
    options?: TransactionOptions
  ): Promise<
    Result<BomSnapshot, ManufacturingError | BomAlreadyExistsError | CyclicBomDependencyError>
  >

  abstract getBom(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<BomSnapshot, BomNotFoundError>>

  abstract createWorkOrder(
    input: CreateWorkOrderInput,
    options?: TransactionOptions
  ): Promise<Result<WorkOrderSnapshot, ManufacturingError | BomNotFoundError>>

  abstract releaseWorkOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError
    >
  >

  abstract issueMaterials(
    input: IssueMaterialsInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      WorkOrderSnapshot,
      | ManufacturingError
      | WorkOrderNotFoundError
      | InvalidWorkOrderStateError
      | MaterialIssueQuantityExceededError
    >
  >

  abstract completeWorkOrder(
    input: CompleteWorkOrderInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError
    >
  >

  abstract getWorkOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<WorkOrderSnapshot, WorkOrderNotFoundError>>

  abstract allocateOverhead(
    input: AllocateOverheadInput,
    options?: TransactionOptions
  ): Promise<Result<OverheadAllocationSummary, ManufacturingError | WorkOrderNotFoundError>>
}
