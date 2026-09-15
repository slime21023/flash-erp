import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import {
  OutboxService,
  type TransactionOptions,
  runInTransaction,
} from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import { scopeMismatch } from '@platform/context/index.js'
import { ScopeForbiddenError } from '@platform/security/index.js'
import { InventoryContract } from '@modules/inventory/contracts/index.js'
import { FinanceContract, type JournalLine } from '@modules/finance/contracts/index.js'
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
  type BomSnapshot,
  type CompleteWorkOrderInput,
  type CreateWorkOrderInput,
  type IssueMaterialsInput,
  type OverheadAllocationDetail,
  type OverheadAllocationSummary,
  type RegisterBomInput,
  type WorkOrderSnapshot,
} from '../contracts/index.js'
import { BomEntity } from '../entities/bom.entity.js'
import { BomLineEntity } from '../entities/bom_line.entity.js'
import { WorkOrderEntity } from '../entities/work_order.entity.js'
import { WorkOrderLineEntity } from '../entities/work_order_line.entity.js'
import { BomExplosionEngine } from './bom_explosion_engine.js'
import { OverheadAllocationEngine } from './overhead_allocation_engine.js'

function stableReference(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex')
  return `${prefix}-${digest.slice(0, 48)}`
}

@Injectable()
export class TypeOrmManufacturingService extends ManufacturingContract {
  constructor(
    @InjectRepository(BomEntity)
    private readonly bomRepo: Repository<BomEntity>,
    @InjectRepository(BomLineEntity)
    private readonly bomLineRepo: Repository<BomLineEntity>,
    @InjectRepository(WorkOrderEntity)
    private readonly woRepo: Repository<WorkOrderEntity>,
    @InjectRepository(WorkOrderLineEntity)
    private readonly woLineRepo: Repository<WorkOrderLineEntity>,
    private readonly inventory: InventoryContract,
    private readonly finance: FinanceContract,
    private readonly outbox: OutboxService
  ) {
    super()
  }

  async registerBom(
    input: RegisterBomInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      BomSnapshot,
      ManufacturingError | BomAlreadyExistsError | CyclicBomDependencyError | ScopeForbiddenError
    >
  > {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()
    const parentItemId = input.parentItemId.trim()

    if (!id || !companyId || !code || !name || !parentItemId || input.lines.length === 0) {
      return err(new ManufacturingError('BOM fields are required'))
    }

    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'BOM'))

    const manager = options?.client ?? this.bomRepo.manager
    const lineIds = new Set<string>()
    const bomLines = input.lines.map((line) => ({
      componentItemId: line.componentItemId.trim(),
      quantityPerBase: line.quantityPerBase,
      scrapPercentageBasisPoints: line.scrapPercentageBasisPoints ?? 0,
      memo: line.memo,
    }))
    if ((input.baseQuantity ?? 1n) <= 0n) {
      return err(new ManufacturingError('BOM base quantity must be positive'))
    }
    for (const line of bomLines) {
      if (
        !line.componentItemId ||
        lineIds.has(line.componentItemId) ||
        line.componentItemId === parentItemId ||
        line.quantityPerBase <= 0n ||
        !Number.isInteger(line.scrapPercentageBasisPoints) ||
        line.scrapPercentageBasisPoints < 0 ||
        line.scrapPercentageBasisPoints > 10_000
      ) {
        if (line.componentItemId === parentItemId) {
          return err(new CyclicBomDependencyError(parentItemId, parentItemId))
        }
        return err(new ManufacturingError('BOM lines must be unique, positive, and valid'))
      }
      lineIds.add(line.componentItemId)
    }

    const parentItemRes = await this.inventory.findItem(companyId, parentItemId, {
      ...options,
      client: manager,
    })
    if (parentItemRes.isErr) return err(new ManufacturingError(parentItemRes.error.message))
    for (const line of bomLines) {
      const itemRes = await this.inventory.findItem(companyId, line.componentItemId, {
        ...options,
        client: manager,
      })
      if (itemRes.isErr) return err(new ManufacturingError(itemRes.error.message))
    }

    const existing = await manager.findOne(BomEntity, {
      where: [{ id }, { companyId, code }],
    })
    if (existing) {
      return err(new BomAlreadyExistsError(code))
    }

    try {
      const entity = manager.create(BomEntity, {
        id,
        companyId,
        code,
        name,
        parentItemId,
        baseQuantity: (input.baseQuantity ?? 1n).toString(),
        lines: bomLines.map((l, idx) =>
          manager.create(BomLineEntity, {
            id: `${id}-line-${idx}`,
            bomId: id,
            componentItemId: l.componentItemId,
            quantityPerBase: l.quantityPerBase.toString(),
            scrapPercentageBasisPoints: l.scrapPercentageBasisPoints ?? 0,
            memo: l.memo,
          })
        ),
      })
      await manager.save(entity)

      return ok({
        id: entity.id,
        companyId: entity.companyId,
        code: entity.code,
        name: entity.name,
        parentItemId: entity.parentItemId,
        baseQuantity: BigInt(entity.baseQuantity),
        lines: entity.lines.map((l) => ({
          componentItemId: l.componentItemId,
          quantityPerBase: BigInt(l.quantityPerBase),
          scrapPercentageBasisPoints: l.scrapPercentageBasisPoints,
          memo: l.memo,
        })),
      })
    } catch {
      return err(new ManufacturingError(`Unable to register BOM: ${id}`))
    }
  }

  async getBom(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<BomSnapshot, BomNotFoundError | ScopeForbiddenError>> {
    const manager = options?.client ?? this.bomRepo.manager
    const entity = await manager.findOne(BomEntity, {
      where: { id },
      relations: ['lines'],
    })
    if (!entity) {
      return err(new BomNotFoundError(id))
    }
    const selectedScope = scopeMismatch(entity.companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'BOM'))
    return ok({
      id: entity.id,
      companyId: entity.companyId,
      code: entity.code,
      name: entity.name,
      parentItemId: entity.parentItemId,
      baseQuantity: BigInt(entity.baseQuantity),
      lines: entity.lines.map((l) => ({
        componentItemId: l.componentItemId,
        quantityPerBase: BigInt(l.quantityPerBase),
        scrapPercentageBasisPoints: l.scrapPercentageBasisPoints,
        memo: l.memo,
      })),
    })
  }

  async createWorkOrder(
    input: CreateWorkOrderInput,
    options?: TransactionOptions
  ): Promise<
    Result<WorkOrderSnapshot, ManufacturingError | BomNotFoundError | ScopeForbiddenError>
  > {
    return runInTransaction<
      WorkOrderSnapshot,
      ManufacturingError | BomNotFoundError | ScopeForbiddenError
    >(this.woRepo.manager, options, async (client) => {
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
        return err(new ManufacturingError('Work order fields are required'))
      }

      const selectedScope = scopeMismatch(companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'work order'))

      if (input.targetQuantity <= 0n) {
        return err(new ManufacturingError('Target quantity must be greater than zero'))
      }

      const existingWorkOrder = await client.findOne(WorkOrderEntity, {
        where: [{ id }, { companyId, workOrderNumber }],
      })
      if (existingWorkOrder) {
        return err(new ManufacturingError(`Work order already exists: ${id}`))
      }

      const bom = await client.findOne(BomEntity, {
        where: { id: bomId },
        relations: ['lines'],
      })
      if (!bom || bom.companyId !== companyId) {
        return err(new BomNotFoundError(bomId))
      }

      const outputWarehouseRes = await this.inventory.findWarehouse(companyId, outputWarehouseId, {
        ...options,
        client,
      })
      const rawWarehouseRes = await this.inventory.findWarehouse(
        companyId,
        rawMaterialWarehouseId,
        {
          ...options,
          client,
        }
      )
      if (outputWarehouseRes.isErr || rawWarehouseRes.isErr) {
        return err(
          new ManufacturingError('Work order warehouses must be active in the same company')
        )
      }
      const outputItemRes = await this.inventory.findItem(companyId, bom.parentItemId, {
        ...options,
        client,
      })
      if (outputItemRes.isErr) return err(new ManufacturingError(outputItemRes.error.message))

      const explodedResult = BomExplosionEngine.tryExplode({
        targetQuantity: input.targetQuantity,
        baseQuantity: BigInt(bom.baseQuantity),
        lines: bom.lines.map((l) => ({
          componentItemId: l.componentItemId,
          quantityPerBase: BigInt(l.quantityPerBase),
          scrapPercentageBasisPoints: l.scrapPercentageBasisPoints,
        })),
      })
      if (explodedResult.isErr) return err(explodedResult.error)
      const exploded = explodedResult.value

      try {
        const entity = client.create(WorkOrderEntity, {
          id,
          companyId,
          workOrderNumber,
          bomId,
          outputItemId: bom.parentItemId,
          outputWarehouseId,
          rawMaterialWarehouseId,
          targetQuantity: input.targetQuantity.toString(),
          completedQuantity: '0',
          status: 'DRAFT',
          actualDirectMaterialCostMinorUnits: '0',
          allocatedOverheadCostMinorUnits: '0',
          totalCostMinorUnits: '0',
          unitCostMinorUnits: '0',
          memo: input.memo,
          lines: exploded.map((item, idx) =>
            client.create(WorkOrderLineEntity, {
              id: `${id}-line-${idx}`,
              workOrderId: id,
              componentItemId: item.componentItemId,
              warehouseId: rawMaterialWarehouseId,
              plannedQuantity: item.plannedQuantity.toString(),
              issuedQuantity: '0',
            })
          ),
        })
        await client.save(entity)

        return ok({
          id: entity.id,
          companyId: entity.companyId,
          workOrderNumber: entity.workOrderNumber,
          bomId: entity.bomId,
          outputItemId: entity.outputItemId,
          outputWarehouseId: entity.outputWarehouseId,
          rawMaterialWarehouseId: entity.rawMaterialWarehouseId,
          targetQuantity: BigInt(entity.targetQuantity),
          completedQuantity: 0n,
          status: entity.status as any,
          actualDirectMaterialCostMinorUnits: 0n,
          allocatedOverheadCostMinorUnits: 0n,
          totalCostMinorUnits: 0n,
          unitCostMinorUnits: 0n,
          lines: entity.lines.map((l) => ({
            id: l.id,
            componentItemId: l.componentItemId,
            warehouseId: l.warehouseId,
            plannedQuantity: BigInt(l.plannedQuantity),
            issuedQuantity: 0n,
          })),
          memo: entity.memo,
        })
      } catch {
        return err(new ManufacturingError(`Unable to create work order: ${id}`))
      }
    })
  }

  async releaseWorkOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError | ScopeForbiddenError
    >(this.woRepo.manager, options, async (manager) => {
      const wo = await manager
        .createQueryBuilder(WorkOrderEntity, 'wo')
        .leftJoinAndSelect('wo.lines', 'lines')
        .setLock('pessimistic_write')
        .where('wo.id = :id', { id })
        .getOne()
      if (!wo) {
        return err(new WorkOrderNotFoundError(id))
      }
      const selectedScope = scopeMismatch(wo.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'work order'))

      if (wo.status !== 'DRAFT') {
        return err(new InvalidWorkOrderStateError(wo.status, 'release'))
      }

      wo.status = 'RELEASED'
      await manager.save(wo)

      const eventResult = await this.outbox.enqueue(
        WorkOrderReleasedEvent.EVENT_NAME,
        new WorkOrderReleasedEvent(
          wo.id,
          wo.companyId,
          wo.outputItemId,
          BigInt(wo.targetQuantity),
          new Date()
        ),
        { client: manager }
      )
      if (eventResult.isErr) return err(new ManufacturingError(eventResult.error.message))

      return ok({
        id: wo.id,
        companyId: wo.companyId,
        workOrderNumber: wo.workOrderNumber,
        bomId: wo.bomId,
        outputItemId: wo.outputItemId,
        outputWarehouseId: wo.outputWarehouseId,
        rawMaterialWarehouseId: wo.rawMaterialWarehouseId,
        targetQuantity: BigInt(wo.targetQuantity),
        completedQuantity: BigInt(wo.completedQuantity),
        status: wo.status as any,
        actualDirectMaterialCostMinorUnits: BigInt(wo.actualDirectMaterialCostMinorUnits),
        allocatedOverheadCostMinorUnits: BigInt(wo.allocatedOverheadCostMinorUnits),
        totalCostMinorUnits: BigInt(wo.totalCostMinorUnits),
        unitCostMinorUnits: BigInt(wo.unitCostMinorUnits),
        lines: wo.lines.map((l) => ({
          id: l.id,
          componentItemId: l.componentItemId,
          warehouseId: l.warehouseId,
          plannedQuantity: BigInt(l.plannedQuantity),
          issuedQuantity: BigInt(l.issuedQuantity),
        })),
        memo: wo.memo,
      })
    })
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
      | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      WorkOrderSnapshot,
      | ManufacturingError
      | WorkOrderNotFoundError
      | InvalidWorkOrderStateError
      | MaterialIssueQuantityExceededError
      | ScopeForbiddenError
    >(this.woRepo.manager, options, async (client) => {
      const wo = await client
        .createQueryBuilder(WorkOrderEntity, 'wo')
        .leftJoinAndSelect('wo.lines', 'lines')
        .setLock('pessimistic_write')
        .where('wo.id = :id', { id: input.workOrderId })
        .getOne()
      if (!wo) {
        return err(new WorkOrderNotFoundError(input.workOrderId))
      }
      const selectedScope = scopeMismatch(wo.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'work order'))

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
      let financeCurrency: string | null = null
      for (const req of input.lines) {
        const componentItemId = req.componentItemId.trim()
        const woLine = wo.lines.find((l) => l.componentItemId === componentItemId)
        if (!woLine) {
          return err(new ManufacturingError(`Item ${componentItemId} is not in work order`))
        }

        const issued = BigInt(woLine.issuedQuantity)
        const planned = BigInt(woLine.plannedQuantity)

        if (issued + req.quantity > planned) {
          return err(
            new MaterialIssueQuantityExceededError(
              req.componentItemId,
              issued + req.quantity,
              planned
            )
          )
        }

        let unitCost = 100n
        let currency = 'TWD'

        {
          const stockRes = await this.inventory.stock(
            wo.companyId,
            componentItemId,
            woLine.warehouseId,
            { client }
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
            { client }
          )
          if (movRes.isErr) {
            return err(new ManufacturingError(movRes.error.message))
          }
        }

        const lineCost = req.quantity * unitCost
        additionalCost += lineCost
        woLine.issuedQuantity = (issued + req.quantity).toString()
        await client.save(woLine)

        const eventResult = await this.outbox.enqueue(
          MaterialIssuedEvent.EVENT_NAME,
          new MaterialIssuedEvent(
            wo.id,
            wo.companyId,
            componentItemId,
            req.quantity,
            lineCost,
            new Date(input.issueDate)
          ),
          { client }
        )
        if (eventResult.isErr) return err(new ManufacturingError(eventResult.error.message))
      }

      const currentMaterialCost = BigInt(wo.actualDirectMaterialCostMinorUnits)
      const currentOverheadCost = BigInt(wo.allocatedOverheadCostMinorUnits)
      const newMaterialCost = currentMaterialCost + additionalCost
      const newTotalCost = newMaterialCost + currentOverheadCost

      wo.actualDirectMaterialCostMinorUnits = newMaterialCost.toString()
      wo.totalCostMinorUnits = newTotalCost.toString()
      wo.status = 'IN_PROGRESS'
      await client.save(wo)

      if (additionalCost > 0n) {
        const accountingCurrency = financeCurrency ?? 'TWD'
        const zeroRes = Money.zero(accountingCurrency)
        const costRes = Money.fromMinorUnits(additionalCost, accountingCurrency)
        if (zeroRes.isOk && costRes.isOk) {
          const journalSuffix = randomUUID().replaceAll('-', '').slice(0, 12)
          const wipJournalId = `je-wip-${wo.id.slice(0, 32)}-${journalSuffix}`
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
              id: wipJournalId,
              companyId: wo.companyId,
              number: `JE-WIP-${wo.workOrderNumber.slice(0, 32)}-${journalSuffix}`,
              accountingDate: input.issueDate,
              memo: `WIP Direct Materials for WO ${wo.workOrderNumber}`,
              lines,
            },
            { client }
          )
          if (wipDraftRes.isErr) {
            return err(new ManufacturingError(wipDraftRes.error.message))
          }

          const wipPostRes = await this.finance.postDraft(wipJournalId, undefined, { client })
          if (wipPostRes.isErr) {
            return err(new ManufacturingError(wipPostRes.error.message))
          }
        }
      }

      return ok({
        id: wo.id,
        companyId: wo.companyId,
        workOrderNumber: wo.workOrderNumber,
        bomId: wo.bomId,
        outputItemId: wo.outputItemId,
        outputWarehouseId: wo.outputWarehouseId,
        rawMaterialWarehouseId: wo.rawMaterialWarehouseId,
        targetQuantity: BigInt(wo.targetQuantity),
        completedQuantity: BigInt(wo.completedQuantity),
        status: wo.status as any,
        actualDirectMaterialCostMinorUnits: newMaterialCost,
        allocatedOverheadCostMinorUnits: currentOverheadCost,
        totalCostMinorUnits: newTotalCost,
        unitCostMinorUnits: BigInt(wo.unitCostMinorUnits),
        lines: wo.lines.map((l) => ({
          id: l.id,
          componentItemId: l.componentItemId,
          warehouseId: l.warehouseId,
          plannedQuantity: BigInt(l.plannedQuantity),
          issuedQuantity: BigInt(l.issuedQuantity),
        })),
        memo: wo.memo,
      })
    })
  }

  async completeWorkOrder(
    input: CompleteWorkOrderInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      WorkOrderSnapshot,
      ManufacturingError | WorkOrderNotFoundError | InvalidWorkOrderStateError | ScopeForbiddenError
    >(this.woRepo.manager, options, async (client) => {
      const wo = await client
        .createQueryBuilder(WorkOrderEntity, 'wo')
        .leftJoinAndSelect('wo.lines', 'lines')
        .setLock('pessimistic_write')
        .where('wo.id = :id', { id: input.workOrderId })
        .getOne()
      if (!wo) {
        return err(new WorkOrderNotFoundError(input.workOrderId))
      }
      const selectedScope = scopeMismatch(wo.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'work order'))

      if (wo.status !== 'IN_PROGRESS') {
        return err(new InvalidWorkOrderStateError(wo.status, 'complete'))
      }

      if (input.completedQuantity <= 0n) {
        return err(new ManufacturingError('Completed quantity must be greater than zero'))
      }

      if (input.completedQuantity > BigInt(wo.targetQuantity)) {
        return err(new ManufacturingError('Completed quantity cannot exceed work order target'))
      }

      const totalCost = BigInt(wo.totalCostMinorUnits)
      const unitCost = input.completedQuantity > 0n ? totalCost / input.completedQuantity : 0n
      let currency = 'TWD'

      const outputStock = await this.inventory.stock(
        wo.companyId,
        wo.outputItemId,
        wo.outputWarehouseId,
        { client }
      )
      if (outputStock.isErr) return err(new ManufacturingError(outputStock.error.message))
      currency = outputStock.value.currency ?? 'TWD'

      {
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
          { client }
        )
        if (recRes.isErr) {
          return err(new ManufacturingError(recRes.error.message))
        }
      }

      if (totalCost > 0n) {
        const zeroRes = Money.zero(currency)
        const costRes = Money.fromMinorUnits(totalCost, currency)
        if (zeroRes.isOk && costRes.isOk) {
          const finishedGoodsJournalId = `je-fg-${wo.id}`
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
              id: finishedGoodsJournalId,
              companyId: wo.companyId,
              number: `JE-FG-${wo.workOrderNumber}`,
              accountingDate: input.completionDate,
              memo: `Finished Goods for WO ${wo.workOrderNumber}`,
              lines,
            },
            { client }
          )
          if (finishedGoodsDraftRes.isErr) {
            return err(new ManufacturingError(finishedGoodsDraftRes.error.message))
          }

          const finishedGoodsPostRes = await this.finance.postDraft(
            finishedGoodsJournalId,
            undefined,
            { client }
          )
          if (finishedGoodsPostRes.isErr) {
            return err(new ManufacturingError(finishedGoodsPostRes.error.message))
          }
        }
      }

      wo.status = 'COMPLETED'
      wo.completedQuantity = input.completedQuantity.toString()
      wo.unitCostMinorUnits = unitCost.toString()
      wo.completedAt = new Date(input.completionDate)
      await client.save(wo)

      const eventResult = await this.outbox.enqueue(
        WorkOrderCompletedEvent.EVENT_NAME,
        new WorkOrderCompletedEvent(
          wo.id,
          wo.companyId,
          wo.outputItemId,
          input.completedQuantity,
          totalCost,
          unitCost,
          wo.completedAt
        ),
        { client }
      )
      if (eventResult.isErr) return err(new ManufacturingError(eventResult.error.message))

      return ok({
        id: wo.id,
        companyId: wo.companyId,
        workOrderNumber: wo.workOrderNumber,
        bomId: wo.bomId,
        outputItemId: wo.outputItemId,
        outputWarehouseId: wo.outputWarehouseId,
        rawMaterialWarehouseId: wo.rawMaterialWarehouseId,
        targetQuantity: BigInt(wo.targetQuantity),
        completedQuantity: input.completedQuantity,
        status: wo.status as any,
        actualDirectMaterialCostMinorUnits: BigInt(wo.actualDirectMaterialCostMinorUnits),
        allocatedOverheadCostMinorUnits: BigInt(wo.allocatedOverheadCostMinorUnits),
        totalCostMinorUnits: totalCost,
        unitCostMinorUnits: unitCost,
        lines: wo.lines.map((l) => ({
          id: l.id,
          componentItemId: l.componentItemId,
          warehouseId: l.warehouseId,
          plannedQuantity: BigInt(l.plannedQuantity),
          issuedQuantity: BigInt(l.issuedQuantity),
        })),
        memo: wo.memo,
        completedAt: wo.completedAt,
      })
    })
  }

  async getWorkOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<WorkOrderSnapshot, WorkOrderNotFoundError | ScopeForbiddenError>> {
    const manager = options?.client ?? this.woRepo.manager
    const entity = await manager.findOne(WorkOrderEntity, {
      where: { id },
      relations: ['lines'],
    })
    if (!entity) {
      return err(new WorkOrderNotFoundError(id))
    }
    const selectedScope = scopeMismatch(entity.companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'work order'))
    return ok({
      id: entity.id,
      companyId: entity.companyId,
      workOrderNumber: entity.workOrderNumber,
      bomId: entity.bomId,
      outputItemId: entity.outputItemId,
      outputWarehouseId: entity.outputWarehouseId,
      rawMaterialWarehouseId: entity.rawMaterialWarehouseId,
      targetQuantity: BigInt(entity.targetQuantity),
      completedQuantity: BigInt(entity.completedQuantity),
      status: entity.status as any,
      actualDirectMaterialCostMinorUnits: BigInt(entity.actualDirectMaterialCostMinorUnits),
      allocatedOverheadCostMinorUnits: BigInt(entity.allocatedOverheadCostMinorUnits),
      totalCostMinorUnits: BigInt(entity.totalCostMinorUnits),
      unitCostMinorUnits: BigInt(entity.unitCostMinorUnits),
      lines: entity.lines.map((l) => ({
        id: l.id,
        componentItemId: l.componentItemId,
        warehouseId: l.warehouseId,
        plannedQuantity: BigInt(l.plannedQuantity),
        issuedQuantity: BigInt(l.issuedQuantity),
      })),
      memo: entity.memo,
      completedAt: entity.completedAt,
    })
  }

  async allocateOverhead(
    input: AllocateOverheadInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      OverheadAllocationSummary,
      ManufacturingError | WorkOrderNotFoundError | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      OverheadAllocationSummary,
      ManufacturingError | WorkOrderNotFoundError | ScopeForbiddenError
    >(this.woRepo.manager, options, async (client) => {
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

      const selectedScope = scopeMismatch(companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'overhead allocation'))

      const wos: WorkOrderEntity[] = []

      for (const id of workOrderIds) {
        const wo = await client
          .createQueryBuilder(WorkOrderEntity, 'wo')
          .leftJoinAndSelect('wo.lines', 'lines')
          .setLock('pessimistic_write')
          .where('wo.id = :id', { id })
          .getOne()
        if (!wo || wo.companyId !== companyId) {
          return err(new WorkOrderNotFoundError(id))
        }
        wos.push(wo)
      }

      const targets = wos.map((wo) => {
        const completedQty = BigInt(wo.completedQuantity)
        const targetQty = BigInt(wo.targetQuantity)
        const materialCost = BigInt(wo.actualDirectMaterialCostMinorUnits)
        const weight =
          input.allocationBase === 'COMPLETED_QUANTITY'
            ? completedQty > 0n
              ? completedQty
              : targetQty
            : materialCost
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

      for (const alloc of allocationResults) {
        const wo = wos.find((w) => w.id === alloc.workOrderId)!
        const currentOverhead = BigInt(wo.allocatedOverheadCostMinorUnits)
        const materialCost = BigInt(wo.actualDirectMaterialCostMinorUnits)
        const completedQty = BigInt(wo.completedQuantity)
        const targetQty = BigInt(wo.targetQuantity)

        const newOverhead = currentOverhead + alloc.allocatedAmountMinorUnits
        const newTotal = materialCost + newOverhead
        const divisor = completedQty > 0n ? completedQty : targetQty
        const newUnitCost = divisor > 0n ? newTotal / divisor : 0n

        wo.allocatedOverheadCostMinorUnits = newOverhead.toString()
        wo.totalCostMinorUnits = newTotal.toString()
        wo.unitCostMinorUnits = newUnitCost.toString()
        await client.save(wo)

        details.push({
          workOrderId: wo.id,
          allocatedAmountMinorUnits: alloc.allocatedAmountMinorUnits,
          newTotalCostMinorUnits: newTotal,
          newUnitCostMinorUnits: newUnitCost,
        })
      }

      if (input.totalPoolAmountMinorUnits > 0n) {
        const zeroRes = Money.zero(currency)
        const poolRes = Money.fromMinorUnits(input.totalPoolAmountMinorUnits, currency)
        if (zeroRes.isOk && poolRes.isOk) {
          const journalSuffix = randomUUID().replaceAll('-', '').slice(0, 12)
          const overheadJournalId = `je-overhead-${journalSuffix}`
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
              id: overheadJournalId,
              companyId,
              number: `JE-OH-${journalSuffix}`,
              accountingDate: input.accountingDate,
              memo: 'Manufacturing Overhead Allocation',
              lines,
            },
            { client }
          )
          if (overheadDraftRes.isErr) {
            return err(new ManufacturingError(overheadDraftRes.error.message))
          }

          const overheadPostRes = await this.finance.postDraft(overheadJournalId, undefined, {
            client,
          })
          if (overheadPostRes.isErr) {
            return err(new ManufacturingError(overheadPostRes.error.message))
          }
        }
      }

      const eventResult = await this.outbox.enqueue(
        OverheadAllocatedEvent.EVENT_NAME,
        new OverheadAllocatedEvent(
          companyId,
          input.totalPoolAmountMinorUnits,
          details.length,
          new Date()
        ),
        { client }
      )
      if (eventResult.isErr) return err(new ManufacturingError(eventResult.error.message))

      return ok({
        companyId,
        totalPoolAmountMinorUnits: input.totalPoolAmountMinorUnits,
        allocations: details,
      })
    })
  }
}
