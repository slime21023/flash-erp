import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { createHash, randomUUID } from 'node:crypto'
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

function stableReference(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex')
  return `${prefix}-${digest.slice(0, 48)}`
}

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
    options?: TransactionOptions
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

    if (input.lines.length === 0 || (input.baseQuantity ?? 1n) <= 0n) {
      return err(new ManufacturingError('BOM base quantity and lines are required'))
    }

    const lineIds = new Set<string>()
    const lines: BomLineSnapshot[] = []
    for (const line of input.lines) {
      const componentItemId = line.componentItemId.trim()
      const scrapPercentageBasisPoints = line.scrapPercentageBasisPoints ?? 0
      if (
        !componentItemId ||
        lineIds.has(componentItemId) ||
        line.quantityPerBase <= 0n ||
        !Number.isInteger(scrapPercentageBasisPoints) ||
        scrapPercentageBasisPoints < 0 ||
        scrapPercentageBasisPoints > 10_000
      ) {
        return err(new ManufacturingError('BOM lines must be unique, positive, and valid'))
      }
      if (componentItemId === parentItemId) {
        return err(new CyclicBomDependencyError(parentItemId, parentItemId))
      }
      if (this.inventory) {
        const itemRes = await this.inventory.findItem(companyId, componentItemId, options)
        if (itemRes.isErr) return err(new ManufacturingError(itemRes.error.message))
      }
      lineIds.add(componentItemId)
      lines.push(
        Object.freeze({
          componentItemId,
          quantityPerBase: line.quantityPerBase,
          scrapPercentageBasisPoints,
          memo: line.memo,
        })
      )
    }
    if (this.inventory) {
      const itemRes = await this.inventory.findItem(companyId, parentItemId, options)
      if (itemRes.isErr) return err(new ManufacturingError(itemRes.error.message))
    }

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
    options?: TransactionOptions
  ): Promise<Result<WorkOrderSnapshot, ManufacturingError | BomNotFoundError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const workOrderNumber = input.workOrderNumber.trim()
    const bomId = input.bomId.trim()
    const outputWarehouseId = input.outputWarehouseId.trim()
    const rawMaterialWarehouseId = input.rawMaterialWarehouseId.trim()

    if (
      !id ||
      !companyId ||
      !workOrderNumber ||
      !bomId ||
      !outputWarehouseId ||
      !rawMaterialWarehouseId
    ) {
      return err(new ManufacturingError('Work order id, companyId, number, and bomId are required'))
    }

    if (input.targetQuantity <= 0n) {
      return err(new ManufacturingError('Target quantity must be greater than zero'))
    }

    if (
      this.#workOrders.has(id) ||
      [...this.#workOrders.values()].some(
        (workOrder) =>
          workOrder.companyId === companyId && workOrder.workOrderNumber === workOrderNumber
      )
    ) {
      return err(new ManufacturingError(`Work order already exists: ${id}`))
    }

    const bom = this.#boms.get(bomId)
    if (!bom) {
      return err(new BomNotFoundError(bomId))
    }

    if (this.inventory) {
      const outputWarehouseRes = await this.inventory.findWarehouse(
        companyId,
        outputWarehouseId,
        options
      )
      const rawWarehouseRes = await this.inventory.findWarehouse(
        companyId,
        rawMaterialWarehouseId,
        options
      )
      if (outputWarehouseRes.isErr || rawWarehouseRes.isErr) {
        return err(
          new ManufacturingError('Work order warehouses must be active in the same company')
        )
      }
      const outputItemRes = await this.inventory.findItem(companyId, bom.parentItemId, options)
      if (outputItemRes.isErr) return err(new ManufacturingError(outputItemRes.error.message))
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
        warehouseId: rawMaterialWarehouseId,
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
      outputWarehouseId,
      rawMaterialWarehouseId,
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

    if (input.lines.length === 0) {
      return err(new ManufacturingError('At least one material issue line is required'))
    }

    const issueItemIds = new Set<string>()
    for (const line of input.lines) {
      const itemId = line.componentItemId.trim()
      if (!itemId || line.quantity <= 0n || issueItemIds.has(itemId)) {
        return err(new ManufacturingError('Material issue lines must be unique and positive'))
      }
      issueItemIds.add(itemId)
    }

    const issueReference = stableReference(
      'issue',
      wo.id,
      input.issueDate.trim(),
      ...input.lines.map((line) => `${line.componentItemId.trim()}:${line.quantity}`)
    )

    let additionalCost = 0n
    const linesMap = new Map(wo.lines.map((l) => [l.componentItemId, l]))
    let financeCurrency: string | null = null

    for (const req of input.lines) {
      const componentItemId = req.componentItemId.trim()
      const woLine = linesMap.get(componentItemId)
      if (!woLine) {
        return err(new ManufacturingError(`Item ${componentItemId} is not in work order`))
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
          componentItemId,
          woLine.warehouseId,
          options
        )
        if (stockRes.isErr) {
          return err(new ManufacturingError(stockRes.error.message))
        }

        unitCost = stockRes.value.averageUnitCostMinorUnits
        currency = stockRes.value.currency || 'TWD'
        if (financeCurrency && financeCurrency !== currency) {
          return err(new ManufacturingError('Material issue lines cannot mix currencies'))
        }
        financeCurrency = currency

        const movRes = await this.inventory.recordMovement(
          {
            id: stableReference('mov', issueReference, componentItemId),
            companyId: wo.companyId,
            itemId: componentItemId,
            warehouseId: woLine.warehouseId,
            sourceType: 'WORK_ORDER_ISSUE',
            sourceId: issueReference,
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
        componentItemId,
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
      const accountingCurrency = financeCurrency ?? 'TWD'
      const zeroRes = Money.zero(accountingCurrency)
      const costRes = Money.fromMinorUnits(additionalCost, accountingCurrency)
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
        const journalSuffix = randomUUID().replaceAll('-', '').slice(0, 12)
        const wipJournalId = `je-wip-${wo.id.slice(0, 32)}-${journalSuffix}`
        const wipDraftRes = await this.finance.createDraft(
          {
            id: wipJournalId,
            companyId: wo.companyId,
            number: `JE-WIP-${wo.workOrderNumber.slice(0, 32)}-${journalSuffix}`,
            accountingDate: input.issueDate,
            memo: `WIP Direct Materials for WO ${wo.workOrderNumber}`,
            lines,
          },
          options
        )
        if (wipDraftRes.isErr) {
          return err(new ManufacturingError(wipDraftRes.error.message))
        }
        const wipPostRes = await this.finance.postDraft(wipJournalId, undefined, options)
        if (wipPostRes.isErr) return err(new ManufacturingError(wipPostRes.error.message))
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

    if (input.completedQuantity > wo.targetQuantity) {
      return err(new ManufacturingError('Completed quantity cannot exceed work order target'))
    }

    const totalCost = wo.actualDirectMaterialCostMinorUnits + wo.allocatedOverheadCostMinorUnits
    const unitCost = input.completedQuantity > 0n ? totalCost / input.completedQuantity : 0n
    let currency = 'TWD'

    if (this.inventory) {
      const outputStock = await this.inventory.stock(
        wo.companyId,
        wo.outputItemId,
        wo.outputWarehouseId,
        options
      )
      if (outputStock.isErr) return err(new ManufacturingError(outputStock.error.message))
      currency = outputStock.value.currency ?? 'TWD'
    }

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
          currency,
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
      const zeroRes = Money.zero(currency)
      const costRes = Money.fromMinorUnits(totalCost, currency)
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
        const finishedGoodsJournalId = `je-fg-${wo.id}`
        const finishedGoodsDraftRes = await this.finance.createDraft(
          {
            id: finishedGoodsJournalId,
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
        const finishedGoodsPostRes = await this.finance.postDraft(
          finishedGoodsJournalId,
          undefined,
          options
        )
        if (finishedGoodsPostRes.isErr) {
          return err(new ManufacturingError(finishedGoodsPostRes.error.message))
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
    const companyId = input.companyId.trim()
    const currency = (input.currency || 'TWD').trim().toUpperCase()
    const workOrderIds = input.workOrderIds.map((id) => id.trim())
    if (
      !companyId ||
      workOrderIds.length === 0 ||
      workOrderIds.some((id, index) => !id || workOrderIds.indexOf(id) !== index) ||
      input.totalPoolAmountMinorUnits < 0n ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return err(new ManufacturingError('Overhead allocation input is invalid'))
    }

    const wos: WorkOrderSnapshot[] = []
    for (const id of workOrderIds) {
      const wo = this.#workOrders.get(id)
      if (!wo || wo.companyId !== companyId) {
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
      currency,
      targets,
    })
    if (allocationResult.isErr) return err(allocationResult.error)
    const allocationResults = allocationResult.value

    const details: OverheadAllocationDetail[] = []
    const updatedWorkOrders: WorkOrderSnapshot[] = []

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
      updatedWorkOrders.push(updatedWo)

      details.push({
        workOrderId: wo.id,
        allocatedAmountMinorUnits: alloc.allocatedAmountMinorUnits,
        newTotalCostMinorUnits: newTotal,
        newUnitCostMinorUnits: newUnitCost,
      })
    }

    // Finance overhead application entry
    if (this.finance && input.totalPoolAmountMinorUnits > 0n) {
      const zeroRes = Money.zero(currency)
      const poolRes = Money.fromMinorUnits(input.totalPoolAmountMinorUnits, currency)
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
        const journalSuffix = randomUUID().replaceAll('-', '').slice(0, 12)
        const overheadJournalId = `je-overhead-${journalSuffix}`
        const overheadDraftRes = await this.finance.createDraft(
          {
            id: overheadJournalId,
            companyId,
            number: `JE-OH-${journalSuffix}`,
            accountingDate: input.accountingDate,
            memo: 'Manufacturing Overhead Allocation',
            lines,
          },
          options
        )
        if (overheadDraftRes.isErr) {
          return err(new ManufacturingError(overheadDraftRes.error.message))
        }
        const overheadPostRes = await this.finance.postDraft(overheadJournalId, undefined, options)
        if (overheadPostRes.isErr) {
          return err(new ManufacturingError(overheadPostRes.error.message))
        }
      }
    }

    for (const workOrder of updatedWorkOrders) this.#workOrders.set(workOrder.id, workOrder)

    this.eventEmitter?.emit(
      OverheadAllocatedEvent.EVENT_NAME,
      new OverheadAllocatedEvent(
        companyId,
        input.totalPoolAmountMinorUnits,
        details.length,
        new Date()
      )
    )

    return ok({
      companyId,
      totalPoolAmountMinorUnits: input.totalPoolAmountMinorUnits,
      allocations: Object.freeze(details),
    })
  }
}
