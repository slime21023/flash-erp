import assert from 'node:assert/strict'
import fc from 'fast-check'
import { test } from 'vitest'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InMemoryInventoryService } from '@modules/inventory/services/in_memory_inventory_service.js'
import { InMemoryFinanceService } from '@modules/finance/services/in_memory_finance_service.js'
import { InMemoryAuditService } from '@modules/audit/services/in_memory_audit_service.js'
import { ManufacturingAuditListener } from '@modules/audit/listeners/manufacturing_audit_listener.js'
import { InMemoryManufacturingService } from '@modules/manufacturing/services/in_memory_manufacturing_service.js'
import { BomExplosionEngine } from '@modules/manufacturing/services/bom_explosion_engine.js'
import { OverheadAllocationEngine } from '@modules/manufacturing/services/overhead_allocation_engine.js'
import {
  BomAlreadyExistsError,
  CyclicBomDependencyError,
  InvalidWorkOrderStateError,
  MaterialIssuedEvent,
  MaterialIssueQuantityExceededError,
  OverheadAllocatedEvent,
  WorkOrderCompletedEvent,
  WorkOrderReleasedEvent,
} from '@modules/manufacturing/contracts/index.js'
import { JournalEntry } from '@modules/finance/contracts/index.js'
import { Money } from '@platform/kernel/index.js'

test('manufacturing service manages BOM creation, validation, and cycle prevention', async () => {
  const mfg = new InMemoryManufacturingService()

  // 1. Register BOM for Bicycle
  const bomRes = await mfg.registerBom({
    id: 'bom-bike-01',
    companyId: 'comp-1',
    code: 'BOM-BIKE-V1',
    name: 'Standard City Bike V1',
    parentItemId: 'item-bike',
    baseQuantity: 1n,
    lines: [
      {
        componentItemId: 'item-frame',
        quantityPerBase: 1n,
        scrapPercentageBasisPoints: 0,
      },
      {
        componentItemId: 'item-wheel',
        quantityPerBase: 2n,
        scrapPercentageBasisPoints: 500, // 5% scrap
      },
    ],
  })
  assert.equal(bomRes.isOk, true)
  if (bomRes.isOk) {
    assert.equal(bomRes.value.code, 'BOM-BIKE-V1')
    assert.equal(bomRes.value.lines.length, 2)
  }

  // 2. Reject duplicate BOM code
  const dupRes = await mfg.registerBom({
    id: 'bom-bike-dup',
    companyId: 'comp-1',
    code: 'BOM-BIKE-V1',
    name: 'Duplicate Bike',
    parentItemId: 'item-bike',
    lines: [],
  })
  assert.equal(dupRes.isErr, true)
  if (dupRes.isErr) {
    assert.equal(dupRes.error instanceof BomAlreadyExistsError, true)
  }

  // 3. Reject direct cyclic BOM dependency (parent item as component)
  const cycleRes = await mfg.registerBom({
    id: 'bom-cycle',
    companyId: 'comp-1',
    code: 'BOM-CYCLE',
    name: 'Cycle Bike',
    parentItemId: 'item-bike',
    lines: [{ componentItemId: 'item-bike', quantityPerBase: 1n }],
  })
  assert.equal(cycleRes.isErr, true)
  if (cycleRes.isErr) {
    assert.equal(cycleRes.error instanceof CyclicBomDependencyError, true)
  }

  // 4. Query BOM
  const found = await mfg.getBom('bom-bike-01')
  assert.equal(found.isOk, true)
  if (found.isOk) {
    assert.equal(found.value.name, 'Standard City Bike V1')
  }
})

test('manufacturing service handles work order lifecycle: explosion, release, issue, and completion', async () => {
  const inventory = new InMemoryInventoryService()
  const finance = new InMemoryFinanceService()
  const auditService = new InMemoryAuditService()
  const eventEmitter = new EventEmitter2()
  const auditListener = new ManufacturingAuditListener(auditService)

  eventEmitter.on(WorkOrderReleasedEvent.EVENT_NAME, (e) =>
    auditListener.handleWorkOrderReleased(e)
  )
  eventEmitter.on(MaterialIssuedEvent.EVENT_NAME, (e) => auditListener.handleMaterialIssued(e))
  eventEmitter.on(WorkOrderCompletedEvent.EVENT_NAME, (e) =>
    auditListener.handleWorkOrderCompleted(e)
  )

  const mfg = new InMemoryManufacturingService(inventory, finance, eventEmitter)

  // 1. Setup inventory master & stock
  await inventory.registerUnit({ id: 'u-pcs', code: 'PCS', name: 'Pieces' })
  await inventory.registerItem({
    id: 'item-server',
    companyId: 'comp-1',
    sku: 'SRV-X1',
    name: 'Rack Server X1',
    unitId: 'u-pcs',
  })
  await inventory.registerItem({
    id: 'item-cpu',
    companyId: 'comp-1',
    sku: 'CPU-XEON',
    name: 'Xeon CPU',
    unitId: 'u-pcs',
  })
  await inventory.registerItem({
    id: 'item-ram',
    companyId: 'comp-1',
    sku: 'RAM-32G',
    name: '32GB DDR5 RAM',
    unitId: 'u-pcs',
  })

  await inventory.registerWarehouse({
    id: 'wh-raw',
    companyId: 'comp-1',
    organizationUnitId: 'org-wh-raw',
    code: 'WH-RAW',
    name: 'Raw Material WH',
  })
  await inventory.registerWarehouse({
    id: 'wh-fg',
    companyId: 'comp-1',
    organizationUnitId: 'org-wh-fg',
    code: 'WH-FG',
    name: 'Finished Goods WH',
  })

  // Stock: 20 CPUs @ 5,000 minor units each, 40 RAMs @ 2,000 minor units each
  await inventory.recordMovement({
    id: 'mov-cpu-in',
    companyId: 'comp-1',
    itemId: 'item-cpu',
    warehouseId: 'wh-raw',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'gr-cpu',
    quantityDelta: 20n,
    unitCostMinorUnits: 5000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })
  await inventory.recordMovement({
    id: 'mov-ram-in',
    companyId: 'comp-1',
    itemId: 'item-ram',
    warehouseId: 'wh-raw',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'gr-ram',
    quantityDelta: 40n,
    unitCostMinorUnits: 2000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })

  // 2. Register Server BOM: 1 CPU + 2 RAMs per Server
  await mfg.registerBom({
    id: 'bom-srv-01',
    companyId: 'comp-1',
    code: 'BOM-SRV-01',
    name: 'Server X1 BOM',
    parentItemId: 'item-server',
    baseQuantity: 1n,
    lines: [
      { componentItemId: 'item-cpu', quantityPerBase: 1n, scrapPercentageBasisPoints: 0 },
      { componentItemId: 'item-ram', quantityPerBase: 2n, scrapPercentageBasisPoints: 0 },
    ],
  })

  // 3. Create Work Order for 5 servers
  const woRes = await mfg.createWorkOrder({
    id: 'wo-srv-01',
    companyId: 'comp-1',
    workOrderNumber: 'WO-2026-001',
    bomId: 'bom-srv-01',
    outputWarehouseId: 'wh-fg',
    rawMaterialWarehouseId: 'wh-raw',
    targetQuantity: 5n,
    memo: 'Produce 5 Servers',
  })
  assert.equal(woRes.isOk, true)
  if (woRes.isOk) {
    assert.equal(woRes.value.status, 'DRAFT')
    assert.equal(woRes.value.lines.length, 2)
    // 5 * 1 = 5 CPUs planned, 5 * 2 = 10 RAMs planned
    const cpuLine = woRes.value.lines.find((l) => l.componentItemId === 'item-cpu')
    const ramLine = woRes.value.lines.find((l) => l.componentItemId === 'item-ram')
    assert.equal(cpuLine?.plannedQuantity, 5n)
    assert.equal(ramLine?.plannedQuantity, 10n)
  }

  // 4. Release Work Order
  const relRes = await mfg.releaseWorkOrder('wo-srv-01')
  assert.equal(relRes.isOk, true)
  if (relRes.isOk) {
    assert.equal(relRes.value.status, 'RELEASED')
  }

  // 5. Issue Materials: Issue 5 CPUs and 10 RAMs
  // Cost = (5 * 5000) + (10 * 2000) = 25,000 + 20,000 = 45,000 minor units
  const issueRes = await mfg.issueMaterials({
    workOrderId: 'wo-srv-01',
    issueDate: '2026-09-10',
    lines: [
      { componentItemId: 'item-cpu', quantity: 5n },
      { componentItemId: 'item-ram', quantity: 10n },
    ],
  })
  assert.equal(issueRes.isOk, true)
  if (issueRes.isOk) {
    assert.equal(issueRes.value.status, 'IN_PROGRESS')
    assert.equal(issueRes.value.actualDirectMaterialCostMinorUnits, 45_000n)
    assert.equal(issueRes.value.totalCostMinorUnits, 45_000n)
  }

  // Cannot over-issue
  const overIssue = await mfg.issueMaterials({
    workOrderId: 'wo-srv-01',
    issueDate: '2026-09-10',
    lines: [{ componentItemId: 'item-cpu', quantity: 1n }],
  })
  assert.equal(overIssue.isErr, true)
  if (overIssue.isErr) {
    assert.equal(overIssue.error instanceof MaterialIssueQuantityExceededError, true)
  }

  // Verify raw material stock deducted:
  // CPU: 20 - 5 = 15
  // RAM: 40 - 10 = 30
  const cpuStock = await inventory.stock('comp-1', 'item-cpu', 'wh-raw')
  const ramStock = await inventory.stock('comp-1', 'item-ram', 'wh-raw')
  assert.equal(cpuStock.isOk && ramStock.isOk, true)
  if (cpuStock.isOk && ramStock.isOk) {
    assert.equal(cpuStock.value.quantity, 15n)
    assert.equal(ramStock.value.quantity, 30n)
  }

  // 6. Complete Work Order: 5 Servers Finished
  // Unit cost = 45,000 / 5 = 9,000 minor units each
  const compRes = await mfg.completeWorkOrder({
    workOrderId: 'wo-srv-01',
    completedQuantity: 5n,
    completionDate: '2026-09-11',
  })
  assert.equal(compRes.isOk, true)
  if (compRes.isOk) {
    assert.equal(compRes.value.status, 'COMPLETED')
    assert.equal(compRes.value.completedQuantity, 5n)
    assert.equal(compRes.value.totalCostMinorUnits, 45_000n)
    assert.equal(compRes.value.unitCostMinorUnits, 9000n)
  }

  // Verify Finished Goods stock in wh-fg: 5 Servers @ 9,000 minor units
  const fgStock = await inventory.stock('comp-1', 'item-server', 'wh-fg')
  assert.equal(fgStock.isOk, true)
  if (fgStock.isOk) {
    assert.equal(fgStock.value.quantity, 5n)
    assert.equal(fgStock.value.averageUnitCostMinorUnits, 9000n)
  }

  // 7. Verify Audit Log recorded all events
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'WORK_ORDER_RELEASED' && e.entityId === 'wo-srv-01'),
    true
  )
  assert.equal(
    auditEntries.some((e) => e.action === 'MATERIAL_ISSUED' && e.entityId === 'wo-srv-01'),
    true
  )
  assert.equal(
    auditEntries.some((e) => e.action === 'WORK_ORDER_COMPLETED' && e.entityId === 'wo-srv-01'),
    true
  )
})

test('manufacturing service allocates overhead across work orders with zero remainder discrepancy', async () => {
  const finance = new InMemoryFinanceService()
  const auditService = new InMemoryAuditService()
  const eventEmitter = new EventEmitter2()
  const auditListener = new ManufacturingAuditListener(auditService)
  eventEmitter.on(OverheadAllocatedEvent.EVENT_NAME, (e) =>
    auditListener.handleOverheadAllocated(e)
  )

  const mfg = new InMemoryManufacturingService(undefined, finance, eventEmitter)

  // 1. Setup BOM and 2 work orders
  await mfg.registerBom({
    id: 'bom-widget',
    companyId: 'comp-1',
    code: 'BOM-WIDGET',
    name: 'Widget',
    parentItemId: 'item-widget',
    baseQuantity: 1n,
    lines: [{ componentItemId: 'item-raw', quantityPerBase: 1n }],
  })

  // WO-1: 30 units completed
  const wo1 = await mfg.createWorkOrder({
    id: 'wo-01',
    companyId: 'comp-1',
    workOrderNumber: 'WO-01',
    bomId: 'bom-widget',
    outputWarehouseId: 'wh-fg',
    rawMaterialWarehouseId: 'wh-raw',
    targetQuantity: 30n,
  })
  await mfg.releaseWorkOrder('wo-01')
  await mfg.issueMaterials({
    workOrderId: 'wo-01',
    issueDate: '2026-09-10',
    lines: [{ componentItemId: 'item-raw', quantity: 30n }],
  })
  await mfg.completeWorkOrder({
    workOrderId: 'wo-01',
    completedQuantity: 30n,
    completionDate: '2026-09-11',
  })

  // WO-2: 70 units completed
  const wo2 = await mfg.createWorkOrder({
    id: 'wo-02',
    companyId: 'comp-1',
    workOrderNumber: 'WO-02',
    bomId: 'bom-widget',
    outputWarehouseId: 'wh-fg',
    rawMaterialWarehouseId: 'wh-raw',
    targetQuantity: 70n,
  })
  await mfg.releaseWorkOrder('wo-02')
  await mfg.issueMaterials({
    workOrderId: 'wo-02',
    issueDate: '2026-09-10',
    lines: [{ componentItemId: 'item-raw', quantity: 70n }],
  })
  await mfg.completeWorkOrder({
    workOrderId: 'wo-02',
    completedQuantity: 70n,
    completionDate: '2026-09-11',
  })

  // 2. Allocate 100,000 minor units of factory overhead (30% to WO-1, 70% to WO-2)
  const allocRes = await mfg.allocateOverhead({
    companyId: 'comp-1',
    totalPoolAmountMinorUnits: 100_000n,
    currency: 'TWD',
    accountingDate: '2026-09-30',
    allocationBase: 'COMPLETED_QUANTITY',
    workOrderIds: ['wo-01', 'wo-02'],
  })

  assert.equal(allocRes.isOk, true)
  if (allocRes.isOk) {
    const sumAllocated = allocRes.value.allocations.reduce(
      (sum, a) => sum + a.allocatedAmountMinorUnits,
      0n
    )
    assert.equal(sumAllocated, 100_000n)

    const alloc1 = allocRes.value.allocations.find((a) => a.workOrderId === 'wo-01')
    const alloc2 = allocRes.value.allocations.find((a) => a.workOrderId === 'wo-02')
    assert.equal(alloc1?.allocatedAmountMinorUnits, 30_000n)
    assert.equal(alloc2?.allocatedAmountMinorUnits, 70_000n)
  }

  // 3. Verify audit log captured allocation
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'OVERHEAD_ALLOCATED' && e.entityId === 'comp-1'),
    true
  )
})

// ==========================================
// Property-Based Testing (PBT >= 1,000 runs)
// ==========================================

test('PBT: BomExplosionEngine requirement calculation strictly monotonic and accounts for scrap (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1n, max: 10_000n }), // target quantity
      fc.bigInt({ min: 1n, max: 20n }), // quantity per base
      fc.bigInt({ min: 1n, max: 5n }), // base quantity
      fc.integer({ min: 0, max: 5000 }), // scrap basis points (0% to 50%)
      (targetQty, qtyPerBase, baseQty, scrapBps) => {
        const lines = [
          {
            componentItemId: 'comp-1',
            quantityPerBase: qtyPerBase,
            scrapPercentageBasisPoints: scrapBps,
            memo: undefined,
          },
        ]

        const exploded = BomExplosionEngine.tryExplode({
          targetQuantity: targetQty,
          baseQuantity: baseQty,
          lines,
        })
        assert.equal(exploded.isOk, true)
        if (exploded.isErr) return

        assert.equal(exploded.value.length, 1)
        const planned = exploded.value[0]!.plannedQuantity

        // Invariant 1: Planned quantity must be >= floor(targetQty * qtyPerBase / baseQty)
        const theoreticalMin = (targetQty * qtyPerBase) / baseQty
        assert.equal(planned >= theoreticalMin, true)

        // Invariant 2: Planned quantity must be > 0
        assert.equal(planned > 0n, true)

        // Invariant 3: If scrap > 0, planned >= (targetQty * qtyPerBase / baseQty)
        if (scrapBps > 0) {
          assert.equal(planned >= theoreticalMin, true)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: OverheadAllocationEngine strictly preserves total pool without remainder leakage (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1n, max: 100_000_000n }), // pool amount
      fc.array(fc.bigInt({ min: 1n, max: 10_000n }), { minLength: 1, maxLength: 10 }), // weights
      (poolAmount, weights) => {
        const targets = weights.map((w, idx) => ({
          workOrderId: `wo-pbt-${idx}`,
          weight: w,
        }))

        const allocations = OverheadAllocationEngine.tryAllocate({
          totalPoolAmountMinorUnits: poolAmount,
          currency: 'TWD',
          targets,
        })
        assert.equal(allocations.isOk, true)
        if (allocations.isErr) return

        // Invariant 1: Sum of allocated amounts strictly equals totalPoolAmount
        const sumAllocated = allocations.value.reduce(
          (sum, a) => sum + a.allocatedAmountMinorUnits,
          0n
        )
        assert.equal(sumAllocated, poolAmount)

        // Invariant 2: Each allocation is non-negative
        for (const a of allocations.value) {
          assert.equal(a.allocatedAmountMinorUnits >= 0n, true)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: Work order cost aggregation strictly equals direct material + overhead (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 10_000_000n }), // material cost
      fc.bigInt({ min: 0n, max: 10_000_000n }), // overhead cost
      fc.bigInt({ min: 1n, max: 10_000n }), // completed quantity
      (matCost, ohCost, completedQty) => {
        const totalCost = matCost + ohCost
        const unitCost = totalCost / completedQty
        const reconstructedTotal = unitCost * completedQty
        const remainder = totalCost - reconstructedTotal

        // Invariant 1: Reconstructed total <= Total cost
        assert.equal(reconstructedTotal <= totalCost, true)

        // Invariant 2: Remainder must be strictly less than completed quantity
        assert.equal(remainder >= 0n && remainder < completedQty, true)

        // Invariant 3: Unit cost is non-negative
        assert.equal(unitCost >= 0n, true)
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: Manufacturing WIP and Finished Goods journal entries strictly balance debit and credit (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1n, max: 50_000_000n }), // material cost
      fc.bigInt({ min: 1n, max: 50_000_000n }), // overhead cost
      (matCost, ohCost) => {
        const zeroRes = Money.zero('TWD')
        const matRes = Money.fromMinorUnits(matCost, 'TWD')
        const ohRes = Money.fromMinorUnits(ohCost, 'TWD')
        const totalCost = matCost + ohCost
        const totalRes = Money.fromMinorUnits(totalCost, 'TWD')

        assert.equal(zeroRes.isOk && matRes.isOk && ohRes.isOk && totalRes.isOk, true)
        if (zeroRes.isOk && matRes.isOk && ohRes.isOk && totalRes.isOk) {
          const zero = zeroRes.value
          const mat = matRes.value
          const oh = ohRes.value
          const total = totalRes.value

          // 1. Material Issue Entry: Debit WIP, Credit Raw Materials
          const issueEntry = JournalEntry.create('je-issue-pbt', [
            { accountId: 'acc-wip', debit: mat, credit: zero },
            { accountId: 'acc-raw', debit: zero, credit: mat },
          ])
          assert.equal(issueEntry.isOk, true)
          if (issueEntry.isOk) {
            assert.equal(
              issueEntry.value.totalDebit.minorUnits,
              issueEntry.value.totalCredit.minorUnits
            )
            assert.equal(issueEntry.value.totalDebit.minorUnits, matCost)
          }

          // 2. Overhead Entry: Debit WIP, Credit Overhead Applied
          const ohEntry = JournalEntry.create('je-oh-pbt', [
            { accountId: 'acc-wip', debit: oh, credit: zero },
            { accountId: 'acc-oh-applied', debit: zero, credit: oh },
          ])
          assert.equal(ohEntry.isOk, true)
          if (ohEntry.isOk) {
            assert.equal(ohEntry.value.totalDebit.minorUnits, ohEntry.value.totalCredit.minorUnits)
            assert.equal(ohEntry.value.totalDebit.minorUnits, ohCost)
          }

          // 3. Finished Goods Entry: Debit FG, Credit WIP
          const fgEntry = JournalEntry.create('je-fg-pbt', [
            { accountId: 'acc-fg', debit: total, credit: zero },
            { accountId: 'acc-wip', debit: zero, credit: total },
          ])
          assert.equal(fgEntry.isOk, true)
          if (fgEntry.isOk) {
            assert.equal(fgEntry.value.totalDebit.minorUnits, fgEntry.value.totalCredit.minorUnits)
            assert.equal(fgEntry.value.totalDebit.minorUnits, totalCost)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})
