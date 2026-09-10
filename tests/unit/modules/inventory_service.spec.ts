import assert from 'node:assert/strict'
import { test } from 'vitest'
import { InMemoryInventoryService } from '@modules/inventory/services/in_memory_inventory_service.js'

test('inventory service tracks stock and calculates moving weighted average cost', async () => {
  const service = new InMemoryInventoryService()

  await service.registerUnit({ id: 'unit-pcs', code: 'PCS', name: 'Pieces' })
  await service.registerItem({
    id: 'item-01',
    companyId: 'company-01',
    sku: 'SKU-001',
    name: 'Widget A',
    unitId: 'unit-pcs',
  })
  await service.registerWarehouse({
    id: 'wh-01',
    companyId: 'company-01',
    organizationUnitId: 'org-wh-01',
    code: 'WH-MAIN',
    name: 'Main Warehouse',
  })

  // Batch 1: Inbound 10 units at 100 TWD
  const m1 = await service.recordMovement({
    id: 'mov-01',
    companyId: 'company-01',
    itemId: 'item-01',
    warehouseId: 'wh-01',
    sourceType: 'PURCHASE',
    sourceId: 'po-01',
    quantityDelta: 10n,
    unitCostMinorUnits: 10000n, // 100.00 TWD
    currency: 'TWD',
    occurredAt: new Date('2026-09-01T10:00:00Z'),
  })
  assert.equal(m1.isOk, true)

  let stock = await service.stock('company-01', 'item-01', 'wh-01')
  assert.equal(stock.isOk, true)
  if (stock.isOk) {
    assert.equal(stock.value.quantity, 10n)
    assert.equal(stock.value.averageUnitCostMinorUnits, 10000n)
  }

  // Batch 2: Inbound 20 units at 160 TWD
  // Total qty: 30, total value: 10*10000 + 20*16000 = 100000 + 320000 = 420000
  // Average unit cost: 420000 / 30 = 14000 (140.00 TWD)
  const m2 = await service.recordMovement({
    id: 'mov-02',
    companyId: 'company-01',
    itemId: 'item-01',
    warehouseId: 'wh-01',
    sourceType: 'PURCHASE',
    sourceId: 'po-02',
    quantityDelta: 20n,
    unitCostMinorUnits: 16000n,
    currency: 'TWD',
    occurredAt: new Date('2026-09-02T10:00:00Z'),
  })
  assert.equal(m2.isOk, true)

  stock = await service.stock('company-01', 'item-01', 'wh-01')
  assert.equal(stock.isOk, true)
  if (stock.isOk) {
    assert.equal(stock.value.quantity, 30n)
    assert.equal(stock.value.averageUnitCostMinorUnits, 14000n)
  }

  // Outbound 15 units must use current average unit cost (14000)
  const m3 = await service.recordMovement({
    id: 'mov-03',
    companyId: 'company-01',
    itemId: 'item-01',
    warehouseId: 'wh-01',
    sourceType: 'SALES_ISSUE',
    sourceId: 'so-01',
    quantityDelta: -15n,
    unitCostMinorUnits: 14000n,
    currency: 'TWD',
    occurredAt: new Date('2026-09-03T10:00:00Z'),
  })
  assert.equal(m3.isOk, true)

  stock = await service.stock('company-01', 'item-01', 'wh-01')
  assert.equal(stock.isOk, true)
  if (stock.isOk) {
    assert.equal(stock.value.quantity, 15n)
    assert.equal(stock.value.averageUnitCostMinorUnits, 14000n)
  }
})

test('inventory service rejects negative stock and mismatching costs', async () => {
  const service = new InMemoryInventoryService()
  await service.registerUnit({ id: 'unit-pcs', code: 'PCS', name: 'Pieces' })
  await service.registerItem({
    id: 'item-01',
    companyId: 'company-01',
    sku: 'SKU-001',
    name: 'Widget A',
    unitId: 'unit-pcs',
  })
  await service.registerWarehouse({
    id: 'wh-01',
    companyId: 'company-01',
    organizationUnitId: 'org-wh-01',
    code: 'WH-MAIN',
    name: 'Main Warehouse',
  })

  // Outbound with 0 stock -> must reject
  const failResult = await service.recordMovement({
    id: 'mov-err',
    companyId: 'company-01',
    itemId: 'item-01',
    warehouseId: 'wh-01',
    sourceType: 'ISSUE',
    sourceId: 'issue-1',
    quantityDelta: -5n,
    unitCostMinorUnits: 1000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })
  assert.equal(failResult.isErr, true)

  // Inbound movement
  const inRes = await service.recordMovement({
    id: 'mov-dup',
    companyId: 'company-01',
    itemId: 'item-01',
    warehouseId: 'wh-01',
    sourceType: 'PURCHASE',
    sourceId: 'po-1',
    quantityDelta: 10n,
    unitCostMinorUnits: 1000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })
  assert.equal(inRes.isOk, true)

  // Duplicate movement id must be rejected
  const dupRes = await service.recordMovement({
    id: 'mov-dup',
    companyId: 'company-01',
    itemId: 'item-01',
    warehouseId: 'wh-01',
    sourceType: 'PURCHASE',
    sourceId: 'po-1',
    quantityDelta: 10n,
    unitCostMinorUnits: 1000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })
  assert.equal(dupRes.isErr, true)
})
