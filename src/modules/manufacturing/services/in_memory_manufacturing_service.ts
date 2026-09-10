import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import type { InventoryContract } from '@modules/inventory/contracts/index.js'
import type { FinanceContract, JournalLine } from '@modules/finance/contracts/index.js'
import type { EventEmitter2 } from '@nestjs/event-emitter'
import {
  BomAlreadyExistsError,
  BomNotFoundError,
  CyclicBomDependencyError,
  InvalidWorkOrderStateError,
  ManufacturingContract,
  ManufacturingError,
  MaterialIssuedEvent,
  MaterialIssueQuantityExceededError,
  OverheadAllocatedEvent,
  WorkOrderCompletedEvent,
  WorkOrderNotFoundError,
  WorkOrderReleasedEvent,
  type AllocateOverheadInput,
  type BomLineSnapshot,
  type BomSnapshot,
  type CompleteWorkOrderInput,
  type CreateWorkOrderInput,
  type IssueMaterialsInput,
  type OverheadAllocationDetail,
  type OverheadAllocationSummary,
  type RegisterBomInput,
  type WorkOrderLineSnapshot,
  type WorkOrderSnapshot,
} from '../contracts/index.js'
import { BomExplosionEngine } from './bom_explosion_engine.js'
import { OverheadAllocationEngine } from './overhead_allocation_engine.js'

export class InMemoryManufacturingService extends ManufacturingContract {
  readonly #boms = new Map<string, BomSnapshot>()
  readonly #workOrders = new Map<string, WorkOrderSnapshot>()

  constructor(
    private readonly inventory?: InventoryContract,
    private readonly finance?: FinanceContract,
    private readonly eventEmitter?: EventEmitter2
  ) {
    super()
  }

  async registerBom(
    input: RegisterBomInput,
    _options?: TransactionOptions
  ): Promise<
    Result<BomSnapshot, ManufacturingError | BomAlreadyExistsError | CyclicBomDependencyError>
  > {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()
    const parentItemId = input.parentItemId.trim()

    if (!id || !companyId || !code || !name || !parentItemId) {
      return err(
        new ManufacturingError('BOM id, companyId, code, name, and parentItemId are required')
      )
    }

    if (
      this.#boms.has(id) ||
      [...this.#boms.values()].some((b) => b.companyId === companyId && b.code === code)
    ) {
      return err(new BomAlreadyExistsError(code))
    }

    // Direct cycle check
    if (input.lines.some((l) => l.componentItemId === parentItemId)) {
      return err(new CyclicBomDependencyError(parentItemId, parentItemId))
    }

    const lines: BomLineSnapshot[] = input.lines.map((l) =>
      Object.freeze({
        componentItemId: l.componentItemId,
        quantityPerBase: l.quantityPerBase,
        scrapPercentageBasisPoints: l.scrapPercentageBasisPoints ?? 0,
        memo: l.memo,
      })
    )

    const bom: BomSnapshot = Object.freeze({
      id,
      companyId,
      code,
      name,
      parentItemId,
      baseQuantity: input.baseQuantity ?? 1n,
      lines: Object.freeze(lines),
    })

    this.#boms.set(id, bom)
    return ok(bom)
  }

  async getBom(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<BomSnapshot, BomNotFoundError>> {
    const bom = this.#boms.get(id)
    if (!bom) {
      return err(new BomNotFoundError(id))
    }
    return ok(bom)
  }

  async createWorkOrder(
    input: CreateWorkOrderInput,
    _options?: TransactionOptions
  ): Promise<Result<WorkOrderSnapshot, ManufacturingError | BomNotFoundError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const workOrderNumber = input.workOrderNumber.trim()
    const bomId = input.bomId.trim()

    if (!id || !companyId || !workOrderNumber || !bomId) {
      return err(new ManufacturingError('Work order id, companyId, number, and bomId are required'))
    }

    if (input.targetQuantity <= 0n) {
      return err(new ManufacturingError('Target quantity must be greater than zero'))
    }

    const bom = this.#boms.get(bomId)
    if (!bom) {
      return err(new BomNotFoundError(bomId))
    }

    const explodedResult = BomExplosionEngine.tryExplode({
      targetQuantity: input.targetQuantity,
      baseQuantity: bom.baseQuantity,
      lines: bom.lines,
    })
    if (explodedResult.isErr) return err(explodedResult.error)
    const exploded = explodedResult.value

    const lines: WorkOrderLineSnapshot[] = exploded.map((item, idx) =>
      Object.freeze({
        id: `${id}-line-${idx}`,
        componentItemId: item.componentItemId,
        warehouseId: input.rawMaterialWarehouseId,
        plannedQuantity: item.plannedQuantity,
        issuedQuantity: 0n,
      })
    )

    const wo: WorkOrderSnapshot = Object.freeze({
      id,
      companyId,
      workOrderNumber,
      bomId,
      outputItemId: bom.parentItemId,
      outputWarehouseId: input.outputWarehouseId,
      rawMaterialWarehouseId: input.rawMaterialWarehouseId,
      targetQuantity: input.targetQuantity,
      completedQuantity: 0n,
      status: 'DRAFT',
      actualDirectMaterialCostMinorUnits: 0n,
      allocatedOverheadCostMinorUnits: 0n,
      totalCostMinorUnits: 0n,
      unitCostMinorUnits: 0n,
      lines: Object.freeze(lines),
      memo: input.memo,
    })

    this.#workOrders.set(id, wo)
    return ok(wo)
  }

  async releaseWorkOrder(
    id: string,
    _options?: TransactionOptions
  ): Promise<
    Result<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError
    >
  > {
    const wo = this.#workOrders.get(id)
    if (!wo) {
      return err(new WorkOrderNotFoundError(id))
    }

    if (wo.status !== 'DRAFT') {
      return err(new InvalidWorkOrderStateError(wo.status, 'release'))
    }

    const released: WorkOrderSnapshot = Object.freeze({
      ...wo,
      status: 'RELEASED',
    })

    this.#workOrders.set(id, released)
    this.eventEmitter?.emit(
      WorkOrderReleasedEvent.EVENT_NAME,
      new WorkOrderReleasedEvent(
        released.id,
        released.companyId,
        released.outputItemId,
        released.targetQuantity,
        new Date()
      )
    )

    return ok(released)
  }

  async issueMaterials(
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
  > {
    const wo = this.#workOrders.get(input.workOrderId)
    if (!wo) {
      return err(new WorkOrderNotFoundError(input.workOrderId))
    }

    if (wo.status !== 'RELEASED' && wo.status !== 'IN_PROGRESS') {
      return err(new InvalidWorkOrderStateError(wo.status, 'issue materials'))
    }

    let additionalCost = 0n
    const linesMap = new Map(wo.lines.map((l) => [l.componentItemId, l]))

    for (const req of input.lines) {
      const woLine = linesMap.get(req.componentItemId)
      if (!woLine) {
        return err(new ManufacturingError(`Item ${req.componentItemId} is not in work order`))
      }

      if (woLine.issuedQuantity + req.quantity > woLine.plannedQuantity) {
        return err(
          new MaterialIssueQuantityExceededError(
            req.componentItemId,
            woLine.issuedQuantity + req.quantity,
            woLine.plannedQuantity
          )
        )
      }

      let unitCost = 100n
      let currency = 'TWD'

      if (this.inventory) {
        const stockRes = await this.inventory.stock(
          wo.companyId,
          req.componentItemId,
          woLine.warehouseId,
          options
        )
        if (stockRes.isErr) {
          return err(new ManufacturingError(stockRes.error.message))
        }

        unitCost = stockRes.value.averageUnitCostMinorUnits
        currency = stockRes.value.currency || 'TWD'

        const movRes = await this.inventory.recordMovement(
          {
            id: `mov-issue-${wo.id}-${req.componentItemId}-${Date.now()}`,
            companyId: wo.companyId,
            itemId: req.componentItemId,
            warehouseId: woLine.warehouseId,
            sourceType: 'WORK_ORDER_ISSUE',
            sourceId: wo.id,
            quantityDelta: -req.quantity,
            unitCostMinorUnits: unitCost,
            currency,
            occurredAt: new Date(input.issueDate),
          },
          options
        )
        if (movRes.isErr) {
          return err(new ManufacturingError(movRes.error.message))
        }
      }

      const lineCost = req.quantity * unitCost
      additionalCost += lineCost

      linesMap.set(
        req.componentItemId,
        Object.freeze({
          ...woLine,
          issuedQuantity: woLine.issuedQuantity + req.quantity,
        })
      )

      this.eventEmitter?.emit(
        MaterialIssuedEvent.EVENT_NAME,
        new MaterialIssuedEvent(
          wo.id,
          wo.companyId,
          req.componentItemId,
          req.quantity,
          lineCost,
          new Date(input.issueDate)
        )
      )
    }

    const newMaterialCost = wo.actualDirectMaterialCostMinorUnits + additionalCost
    const newTotalCost = newMaterialCost + wo.allocatedOverheadCostMinorUnits

    // Finance WIP entry
    if (this.finance && additionalCost > 0n) {
      const zeroRes = Money.zero('TWD')
      const costRes = Money.fromMinorUnits(additionalCost, 'TWD')
      if (zeroRes.isOk && costRes.isOk) {
        const lines: JournalLine[] = [
          {
            accountId: 'acc-1300-wip',
            debit: costRes.value,
            credit: zeroRes.value,
            memo: `WIP direct materials for WO ${wo.workOrderNumber}`,
          },
          {
            accountId: 'acc-1200-raw-materials',
            debit: zeroRes.value,
            credit: costRes.value,
            memo: `Raw materials issued for WO ${wo.workOrderNumber}`,
          },
        ]
        const wipDraftRes = await this.finance.createDraft(
          {
            id: `je-wip-${wo.id}-${Date.now()}`,
            companyId: wo.companyId,
            number: `JE-WIP-${wo.workOrderNumber}`,
            accountingDate: input.issueDate,
            memo: `WIP Direct Materials for WO ${wo.workOrderNumber}`,
            lines,
          },
          options
        )
        if (wipDraftRes.isErr) {
          return err(new ManufacturingError(wipDraftRes.error.message))
        }
      }
    }

    const updated: WorkOrderSnapshot = Object.freeze({
      ...wo,
      status: 'IN_PROGRESS',
      actualDirectMaterialCostMinorUnits: newMaterialCost,
      totalCostMinorUnits: newTotalCost,
      lines: Object.freeze([...linesMap.values()]),
    })

    this.#workOrders.set(wo.id, updated)
    return ok(updated)
  }

  async completeWorkOrder(
    input: CompleteWorkOrderInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError
    >
  > {
    const wo = this.#workOrders.get(input.workOrderId)
    if (!wo) {
      return err(new WorkOrderNotFoundError(input.workOrderId))
    }

    if (wo.status !== 'IN_PROGRESS') {
      return err(new InvalidWorkOrderStateError(wo.status, 'complete'))
    }

    if (input.completedQuantity <= 0n) {
      return err(new ManufacturingError('Completed quantity must be greater than zero'))
    }

    const totalCost = wo.actualDirectMaterialCostMinorUnits + wo.allocatedOverheadCostMinorUnits
    const unitCost = input.completedQuantity > 0n ? totalCost / input.completedQuantity : 0n

    if (this.inventory) {
      const recRes = await this.inventory.recordMovement(
        {
          id: `mov-complete-${wo.id}`,
          companyId: wo.companyId,
          itemId: wo.outputItemId,
          warehouseId: wo.outputWarehouseId,
          sourceType: 'WORK_ORDER_RECEIPT',
          sourceId: wo.id,
          quantityDelta: input.completedQuantity,
          unitCostMinorUnits: unitCost,
          currency: 'TWD',
          occurredAt: new Date(input.completionDate),
        },
        options
      )
      if (recRes.isErr) {
        return err(new ManufacturingError(recRes.error.message))
      }
    }

    // Finance Finished Goods entry: Debit FG, Credit WIP
    if (this.finance && totalCost > 0n) {
      const zeroRes = Money.zero('TWD')
      const costRes = Money.fromMinorUnits(totalCost, 'TWD')
      if (zeroRes.isOk && costRes.isOk) {
        const lines: JournalLine[] = [
          {
            accountId: 'acc-1210-finished-goods',
            debit: costRes.value,
            credit: zeroRes.value,
            memo: `Finished goods completion for WO ${wo.workOrderNumber}`,
          },
          {
            accountId: 'acc-1300-wip',
            debit: zeroRes.value,
            credit: costRes.value,
            memo: `WIP completion credit for WO ${wo.workOrderNumber}`,
          },
        ]
        const finishedGoodsDraftRes = await this.finance.createDraft(
          {
            id: `je-fg-${wo.id}`,
            companyId: wo.companyId,
            number: `JE-FG-${wo.workOrderNumber}`,
            accountingDate: input.completionDate,
            memo: `Finished Goods for WO ${wo.workOrderNumber}`,
            lines,
          },
          options
        )
        if (finishedGoodsDraftRes.isErr) {
          return err(new ManufacturingError(finishedGoodsDraftRes.error.message))
        }
      }
    }

    const completed: WorkOrderSnapshot = Object.freeze({
      ...wo,
      status: 'COMPLETED',
      completedQuantity: input.completedQuantity,
      totalCostMinorUnits: totalCost,
      unitCostMinorUnits: unitCost,
      completedAt: new Date(input.completionDate),
    })

    this.#workOrders.set(wo.id, completed)
    this.eventEmitter?.emit(
      WorkOrderCompletedEvent.EVENT_NAME,
      new WorkOrderCompletedEvent(
        completed.id,
        completed.companyId,
        completed.outputItemId,
        completed.completedQuantity,
        completed.totalCostMinorUnits,
        completed.unitCostMinorUnits,
        completed.completedAt!
      )
    )

    return ok(completed)
  }

  async getWorkOrder(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<WorkOrderSnapshot, WorkOrderNotFoundError>> {
    const wo = this.#workOrders.get(id)
    if (!wo) {
      return err(new WorkOrderNotFoundError(id))
    }
    return ok(wo)
  }

  async allocateOverhead(
    input: AllocateOverheadInput,
    options?: TransactionOptions
  ): Promise<Result<OverheadAllocationSummary, ManufacturingError | WorkOrderNotFoundError>> {
    const wos: WorkOrderSnapshot[] = []
    for (const id of input.workOrderIds) {
      const wo = this.#workOrders.get(id)
      if (!wo) {
        return err(new WorkOrderNotFoundError(id))
      }
      wos.push(wo)
    }

    const targets = wos.map((wo) => {
      const weight =
        input.allocationBase === 'COMPLETED_QUANTITY'
          ? wo.completedQuantity > 0n
            ? wo.completedQuantity
            : wo.targetQuantity
          : wo.actualDirectMaterialCostMinorUnits
      return {
        workOrderId: wo.id,
        weight: weight > 0n ? weight : 1n,
      }
    })

    const allocationResult = OverheadAllocationEngine.tryAllocate({
      totalPoolAmountMinorUnits: input.totalPoolAmountMinorUnits,
      currency: input.currency || 'TWD',
      targets,
    })
    if (allocationResult.isErr) return err(allocationResult.error)
    const allocationResults = allocationResult.value

    const details: OverheadAllocationDetail[] = []

    for (const alloc of allocationResults) {
      const wo = this.#workOrders.get(alloc.workOrderId)!
      const newOverhead = wo.allocatedOverheadCostMinorUnits + alloc.allocatedAmountMinorUnits
      const newTotal = wo.actualDirectMaterialCostMinorUnits + newOverhead
      const divisor = wo.completedQuantity > 0n ? wo.completedQuantity : wo.targetQuantity
      const newUnitCost = divisor > 0n ? newTotal / divisor : 0n

      const updatedWo: WorkOrderSnapshot = Object.freeze({
        ...wo,
        allocatedOverheadCostMinorUnits: newOverhead,
        totalCostMinorUnits: newTotal,
        unitCostMinorUnits: newUnitCost,
      })
      this.#workOrders.set(wo.id, updatedWo)

      details.push({
        workOrderId: wo.id,
        allocatedAmountMinorUnits: alloc.allocatedAmountMinorUnits,
        newTotalCostMinorUnits: newTotal,
        newUnitCostMinorUnits: newUnitCost,
      })
    }

    // Finance overhead application entry
    if (this.finance && input.totalPoolAmountMinorUnits > 0n) {
      const zeroRes = Money.zero(input.currency || 'TWD')
      const poolRes = Money.fromMinorUnits(input.totalPoolAmountMinorUnits, input.currency || 'TWD')
      if (zeroRes.isOk && poolRes.isOk) {
        const lines: JournalLine[] = [
          {
            accountId: 'acc-1300-wip',
            debit: poolRes.value,
            credit: zeroRes.value,
            memo: 'Overhead allocation to WIP',
          },
          {
            accountId: input.overheadAccount || 'acc-5100-overhead-applied',
            debit: zeroRes.value,
            credit: poolRes.value,
            memo: 'Applied manufacturing overhead',
          },
        ]
        const overheadDraftRes = await this.finance.createDraft(
          {
            id: `je-overhead-${Date.now()}`,
            companyId: input.companyId,
            number: `JE-OH-${Date.now()}`,
            accountingDate: input.accountingDate,
            memo: 'Manufacturing Overhead Allocation',
            lines,
          },
          options
        )
        if (overheadDraftRes.isErr) {
          return err(new ManufacturingError(overheadDraftRes.error.message))
        }
      }
    }

    this.eventEmitter?.emit(
      OverheadAllocatedEvent.EVENT_NAME,
      new OverheadAllocatedEvent(
        input.companyId,
        input.totalPoolAmountMinorUnits,
        details.length,
        new Date()
      )
    )

    return ok({
      companyId: input.companyId,
      totalPoolAmountMinorUnits: input.totalPoolAmountMinorUnits,
      allocations: Object.freeze(details),
    })
  }
}
