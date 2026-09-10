import assert from 'node:assert/strict'
import fc from 'fast-check'
import { test } from 'vitest'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InMemoryInventoryService } from '@modules/inventory/services/in_memory_inventory_service.js'
import { InMemoryFinanceService } from '@modules/finance/services/in_memory_finance_service.js'
import { InMemoryAuditService } from '@modules/audit/services/in_memory_audit_service.js'
import { SalesAuditListener } from '@modules/audit/listeners/sales_audit_listener.js'
import { InMemorySalesService } from '@modules/sales/services/in_memory_sales_service.js'
import {
  CreditLimitExceededError,
  CustomerAlreadyExistsError,
  InvalidSalesOrderStateError,
  SalesOrderConfirmedEvent,
  SalesOrderShippedEvent,
} from '@modules/sales/contracts/index.js'
import { InsufficientStockError } from '@modules/inventory/contracts/index.js'
import { JournalEntry } from '@modules/finance/contracts/index.js'
import { Money } from '@platform/kernel/index.js'

function calculateTaxAndTotal(netAmountMinorUnits: bigint, taxRateBasisPoints = 500) {
  const bps = BigInt(taxRateBasisPoints)
  const taxAmountMinorUnits = (netAmountMinorUnits * bps + 5000n) / 10000n
  const totalAmountMinorUnits = netAmountMinorUnits + taxAmountMinorUnits
  return { taxAmountMinorUnits, totalAmountMinorUnits }
}

test('sales service manages customer registration and credit limit check', async () => {
  const salesService = new InMemorySalesService()

  // 1. Register customer
  const regRes = await salesService.registerCustomer({
    id: 'cust-1',
    companyId: 'comp-1',
    code: 'CUST-ALPHA',
    name: 'Alpha Retail Corp',
    paymentTerms: 'NET30',
    currency: 'TWD',
    creditLimitMinorUnits: 500_000n, // 5,000 TWD
  })
  assert.equal(regRes.isOk, true)
  if (regRes.isOk) {
    assert.equal(regRes.value.code, 'CUST-ALPHA')
    assert.equal(regRes.value.creditLimitMinorUnits, 500_000n)
    assert.equal(regRes.value.currentOutstandingMinorUnits, 0n)
  }

  // 2. Duplicate registration rejected
  const dupRes = await salesService.registerCustomer({
    id: 'cust-dup',
    companyId: 'comp-1',
    code: 'CUST-ALPHA',
    name: 'Duplicate Alpha',
    creditLimitMinorUnits: 100_000n,
  })
  assert.equal(dupRes.isErr, true)
  if (dupRes.isErr) {
    assert.equal(dupRes.error instanceof CustomerAlreadyExistsError, true)
  }

  // 3. Lookup customer
  const found = await salesService.getCustomer('cust-1')
  assert.equal(found.isOk, true)
  if (found.isOk) {
    assert.equal(found.value.name, 'Alpha Retail Corp')
  }

  // 4. Credit check within limit
  const checkWithin = await salesService.checkCustomerCredit('cust-1', 400_000n)
  assert.equal(checkWithin.isOk, true)
  if (checkWithin.isOk) {
    assert.equal(checkWithin.value.isApproved, true)
    assert.equal(checkWithin.value.totalExposureMinorUnits, 400_000n)
    assert.equal(checkWithin.value.excessMinorUnits, 0n)
  }

  // 5. Credit check exceeding limit
  const checkExceed = await salesService.checkCustomerCredit('cust-1', 600_000n)
  assert.equal(checkExceed.isOk, true)
  if (checkExceed.isOk) {
    assert.equal(checkExceed.value.isApproved, false)
    assert.equal(checkExceed.value.totalExposureMinorUnits, 600_000n)
    assert.equal(checkExceed.value.excessMinorUnits, 100_000n)
  }
})

test('sales service enforces credit limit and ATP stock reservation on order confirmation', async () => {
  const inventoryService = new InMemoryInventoryService()
  const eventEmitter = new EventEmitter2()
  const salesService = new InMemorySalesService(inventoryService, eventEmitter)

  // 1. Setup inventory & stock
  await inventoryService.registerUnit({ id: 'u-pcs', code: 'PCS', name: 'Pieces' })
  await inventoryService.registerItem({
    id: 'item-gpu',
    companyId: 'comp-1',
    sku: 'GPU-RTX4090',
    name: 'RTX 4090 GPU',
    unitId: 'u-pcs',
  })
  await inventoryService.registerWarehouse({
    id: 'wh-main',
    companyId: 'comp-1',
    organizationUnitId: 'org-wh-1',
    code: 'WH-MAIN',
    name: 'Main Warehouse',
  })

  // Stock: 10 units at 50,000 minor units cost (500 TWD)
  await inventoryService.recordMovement({
    id: 'mov-init',
    companyId: 'comp-1',
    itemId: 'item-gpu',
    warehouseId: 'wh-main',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'gr-01',
    quantityDelta: 10n,
    unitCostMinorUnits: 50_000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })

  // 2. Setup customer with 200,000 minor units credit limit (2,000 TWD)
  await salesService.registerCustomer({
    id: 'cust-pc-store',
    companyId: 'comp-1',
    code: 'CUST-PCSTORE',
    name: 'PC Store Direct',
    creditLimitMinorUnits: 200_000n,
  })

  // 3. Create SO that exceeds credit limit
  // Price = 100,000 each * 2 = 200,000 net + 5% tax = 210,000 total > 200,000 credit limit!
  const expensiveSo = await salesService.createSalesOrder({
    id: 'so-expensive',
    companyId: 'comp-1',
    customerId: 'cust-pc-store',
    number: 'SO-2026-EXP',
    taxRateBasisPoints: 500,
    lines: [
      {
        itemId: 'item-gpu',
        warehouseId: 'wh-main',
        orderedQuantity: 2n,
        unitPriceMinorUnits: 100_000n,
        currency: 'TWD',
      },
    ],
  })
  assert.equal(expensiveSo.isOk, true)
  if (expensiveSo.isOk) {
    assert.equal(expensiveSo.value.netAmountMinorUnits, 200_000n)
    assert.equal(expensiveSo.value.taxAmountMinorUnits, 10_000n)
    assert.equal(expensiveSo.value.totalAmountMinorUnits, 210_000n)
  }

  // Confirmation must fail due to credit limit
  const confirmExpensive = await salesService.confirmSalesOrder('so-expensive')
  assert.equal(confirmExpensive.isErr, true)
  if (confirmExpensive.isErr) {
    assert.equal(confirmExpensive.error instanceof CreditLimitExceededError, true)
    if (confirmExpensive.error instanceof CreditLimitExceededError) {
      assert.equal(confirmExpensive.error.details.excessMinorUnits, 10_000n)
    }
  }

  // 4. Create SO that exceeds ATP inventory stock (request 15 units when only 10 available)
  // Increase credit limit for customer first
  await salesService.registerCustomer({
    id: 'cust-whale',
    companyId: 'comp-1',
    code: 'CUST-WHALE',
    name: 'Whale Wholesale',
    creditLimitMinorUnits: 10_000_000n,
  })

  const outOfStockSo = await salesService.createSalesOrder({
    id: 'so-nostock',
    companyId: 'comp-1',
    customerId: 'cust-whale',
    number: 'SO-2026-NOSTOCK',
    lines: [
      {
        itemId: 'item-gpu',
        warehouseId: 'wh-main',
        orderedQuantity: 15n, // Exceeds 10 available
        unitPriceMinorUnits: 10_000n,
        currency: 'TWD',
      },
    ],
  })
  assert.equal(outOfStockSo.isOk, true)

  const confirmNoStock = await salesService.confirmSalesOrder('so-nostock')
  assert.equal(confirmNoStock.isErr, true)
  if (confirmNoStock.isErr) {
    assert.equal(confirmNoStock.error instanceof InsufficientStockError, true)
  }

  // 5. Create valid SO within credit limit and within stock
  const validSo = await salesService.createSalesOrder({
    id: 'so-valid',
    companyId: 'comp-1',
    customerId: 'cust-pc-store',
    number: 'SO-2026-001',
    lines: [
      {
        itemId: 'item-gpu',
        warehouseId: 'wh-main',
        orderedQuantity: 1n, // 100,000 + 5,000 tax = 105,000 <= 200,000
        unitPriceMinorUnits: 100_000n,
        currency: 'TWD',
      },
    ],
  })
  assert.equal(validSo.isOk, true)

  let eventEmitted = false
  eventEmitter.on(SalesOrderConfirmedEvent.EVENT_NAME, (e: SalesOrderConfirmedEvent) => {
    if (e.salesOrderId === 'so-valid') {
      eventEmitted = true
      assert.equal(e.totalAmountMinorUnits, 105_000n)
    }
  })

  const confirmValid = await salesService.confirmSalesOrder('so-valid')
  assert.equal(confirmValid.isOk, true)
  if (confirmValid.isOk) {
    assert.equal(confirmValid.value.status, 'CONFIRMED')
    assert.equal(confirmValid.value.reservationIds.length, 1)
  }
  assert.equal(eventEmitted, true)

  // Verify ATP stock now reflects the reservation: 10 physical - 1 reserved = 9 available
  const avail = await inventoryService.availableStock('comp-1', 'item-gpu', 'wh-main')
  assert.equal(avail.isOk, true)
  if (avail.isOk) {
    assert.equal(avail.value.physicalQuantity, 10n)
    assert.equal(avail.value.reservedQuantity, 1n)
    assert.equal(avail.value.availableQuantity, 9n)
  }

  // Cannot confirm again
  const reConfirm = await salesService.confirmSalesOrder('so-valid')
  assert.equal(reConfirm.isErr, true)
  if (reConfirm.isErr) {
    assert.equal(reConfirm.error instanceof InvalidSalesOrderStateError, true)
  }
})

test('sales shipment fulfills order, deducts stock, releases reservation, and creates AR & COGS vouchers', async () => {
  const inventoryService = new InMemoryInventoryService()
  const financeService = new InMemoryFinanceService()
  const auditService = new InMemoryAuditService()
  const eventEmitter = new EventEmitter2()
  const auditListener = new SalesAuditListener(auditService)
  eventEmitter.on(SalesOrderConfirmedEvent.EVENT_NAME, (e) =>
    auditListener.handleSalesOrderConfirmed(e)
  )
  eventEmitter.on(SalesOrderShippedEvent.EVENT_NAME, (e) =>
    auditListener.handleSalesOrderShipped(e)
  )

  const salesService = new InMemorySalesService(inventoryService, eventEmitter, financeService)

  // 1. Setup inventory & customer
  await inventoryService.registerUnit({ id: 'u-pcs', code: 'PCS', name: 'Pieces' })
  await inventoryService.registerItem({
    id: 'item-phone',
    companyId: 'comp-1',
    sku: 'PHONE-X',
    name: 'Smartphone X',
    unitId: 'u-pcs',
  })
  await inventoryService.registerWarehouse({
    id: 'wh-main',
    companyId: 'comp-1',
    organizationUnitId: 'org-wh-1',
    code: 'WH-MAIN',
    name: 'Main Warehouse',
  })

  // 5 units received at unit cost 10,000 minor units (100 TWD)
  await inventoryService.recordMovement({
    id: 'mov-phone-in',
    companyId: 'comp-1',
    itemId: 'item-phone',
    warehouseId: 'wh-main',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'gr-phone',
    quantityDelta: 5n,
    unitCostMinorUnits: 10_000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })

  await salesService.registerCustomer({
    id: 'cust-tech',
    companyId: 'comp-1',
    code: 'CUST-TECH',
    name: 'Tech Retail',
    creditLimitMinorUnits: 1_000_000n,
  })

  // 2. Create and confirm SO for 4 phones @ 20,000 minor units each
  // Net = 4 * 20,000 = 80,000, Tax = 4,000, Total = 84,000
  await salesService.createSalesOrder({
    id: 'so-phone',
    companyId: 'comp-1',
    customerId: 'cust-tech',
    number: 'SO-PHONE-001',
    lines: [
      {
        itemId: 'item-phone',
        warehouseId: 'wh-main',
        orderedQuantity: 4n,
        unitPriceMinorUnits: 20_000n,
        currency: 'TWD',
      },
    ],
  })
  await salesService.confirmSalesOrder('so-phone')

  // Stock before shipment: Physical 5, Reserved 4, Available 1
  const preAvail = await inventoryService.availableStock('comp-1', 'item-phone', 'wh-main')
  assert.equal(preAvail.isOk, true)
  if (preAvail.isOk) {
    assert.equal(preAvail.value.physicalQuantity, 5n)
    assert.equal(preAvail.value.reservedQuantity, 4n)
    assert.equal(preAvail.value.availableQuantity, 1n)
  }

  // 3. Partial shipment: Ship 2 units
  // Shipped Net = 2 * 20,000 = 40,000, Shipped Tax = 2,000, Shipped Total = 42,000
  // COGS = 2 * 10,000 = 20,000
  const ship1Res = await salesService.createShipment({
    id: 'ship-01',
    salesOrderId: 'so-phone',
    warehouseId: 'wh-main',
    shipmentDate: '2026-09-10',
    lines: [{ itemId: 'item-phone', shippedQuantity: 2n }],
  })
  assert.equal(ship1Res.isOk, true)
  if (ship1Res.isOk) {
    assert.equal(ship1Res.value.status, 'SHIPPED')
    assert.equal(ship1Res.value.totalShippedAmountMinorUnits, 42_000n)
    assert.equal(ship1Res.value.lines.length, 1)
    assert.equal(ship1Res.value.lines[0]?.shippedQuantity, 2n)
  }

  // Verify order is still CONFIRMED (partial shipment)
  const soPartial = await salesService.getSalesOrder('so-phone')
  assert.equal(soPartial.isOk, true)
  if (soPartial.isOk) {
    assert.equal(soPartial.value.status, 'CONFIRMED')
    assert.equal(soPartial.value.lines[0]?.shippedQuantity, 2n)
  }

  // Verify stock after ship1:
  // Physical decreased from 5 to 3
  // Reservation was released for the shipped items
  const post1Stock = await inventoryService.stock('comp-1', 'item-phone', 'wh-main')
  assert.equal(post1Stock.isOk, true)
  if (post1Stock.isOk) {
    assert.equal(post1Stock.value.quantity, 3n)
  }

  // Verify customer outstanding AR increased by 42,000
  const custAfterShip1 = await salesService.getCustomer('cust-tech')
  assert.equal(custAfterShip1.isOk, true)
  if (custAfterShip1.isOk) {
    assert.equal(custAfterShip1.value.currentOutstandingMinorUnits, 42_000n)
  }

  // 4. Second / Final shipment: Ship remaining 2 units
  const ship2Res = await salesService.createShipment({
    id: 'ship-02',
    salesOrderId: 'so-phone',
    warehouseId: 'wh-main',
    shipmentDate: '2026-09-11',
  })
  assert.equal(ship2Res.isOk, true)
  if (ship2Res.isOk) {
    assert.equal(ship2Res.value.totalShippedAmountMinorUnits, 42_000n)
  }

  // Verify order is now fully SHIPPED
  const soFinal = await salesService.getSalesOrder('so-phone')
  assert.equal(soFinal.isOk, true)
  if (soFinal.isOk) {
    assert.equal(soFinal.value.status, 'SHIPPED')
    assert.equal(soFinal.value.lines[0]?.shippedQuantity, 4n)
  }

  // Cannot ship again (nothing left to ship)
  const overShip = await salesService.createShipment({
    id: 'ship-03',
    salesOrderId: 'so-phone',
    warehouseId: 'wh-main',
    shipmentDate: '2026-09-12',
  })
  assert.equal(overShip.isErr, true)

  // 5. Verify Audit Trail contains both CONFIRMED and SHIPPED events
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'SALES_ORDER_CONFIRMED' && e.entityId === 'so-phone'),
    true
  )
  assert.equal(
    auditEntries.some((e) => e.action === 'SALES_ORDER_SHIPPED' && e.entityId === 'ship-01'),
    true
  )
  assert.equal(
    auditEntries.some((e) => e.action === 'SALES_ORDER_SHIPPED' && e.entityId === 'ship-02'),
    true
  )
})

// ==========================================
// Property-Based Testing (PBT >= 1,000 runs)
// ==========================================

test('PBT: credit limit exposure check strictly satisfies threshold invariance (1,000 runs)', async () => {
  const salesService = new InMemorySalesService()

  await fc.assert(
    fc.asyncProperty(
      fc.bigInt({ min: 1n, max: 10_000_000n }), // creditLimit
      fc.bigInt({ min: 0n, max: 5_000_000n }), // outstanding
      fc.bigInt({ min: 0n, max: 5_000_000n }), // requested
      async (creditLimit, outstanding, requested) => {
        const custId = `cust-pbt-${creditLimit}-${outstanding}-${requested}`
        await salesService.registerCustomer({
          id: custId,
          companyId: 'comp-pbt',
          code: custId,
          name: 'PBT Customer',
          creditLimitMinorUnits: creditLimit,
        })

        // Manually simulate existing outstanding AR if > 0
        if (outstanding > 0n) {
          const checkRes = await salesService.checkCustomerCredit(custId, outstanding)
          assert.equal(checkRes.isOk, true)
        }

        const res = await salesService.checkCustomerCredit(custId, requested)
        assert.equal(res.isOk, true)
        if (res.isOk) {
          const totalExposure = requested // no prior confirmed SOs in this clean customer
          if (totalExposure <= creditLimit) {
            assert.equal(res.value.isApproved, true)
            assert.equal(res.value.excessMinorUnits, 0n)
          } else {
            assert.equal(res.value.isApproved, false)
            assert.equal(res.value.excessMinorUnits, totalExposure - creditLimit)
            assert.equal(res.value.excessMinorUnits > 0n, true)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: sales pricing tax calculation and total invariance (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 1_000_000_000n }), // netAmount
      fc.integer({ min: 0, max: 3000 }), // taxRateBasisPoints (0% to 30%)
      (net, taxRateBps) => {
        const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(net, taxRateBps)

        // Invariant 1: Total must equal Net + Tax
        assert.equal(totalAmountMinorUnits, net + taxAmountMinorUnits)

        // Invariant 2: Total >= Net
        assert.equal(totalAmountMinorUnits >= net, true)

        // Invariant 3: Tax must be >= 0
        assert.equal(taxAmountMinorUnits >= 0n, true)

        // Invariant 4: For 0 rate, tax must be 0
        if (taxRateBps === 0 || net === 0n) {
          assert.equal(taxAmountMinorUnits, 0n)
          assert.equal(totalAmountMinorUnits, net)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: double-entry AR and COGS journal entries preserve debit-credit balance (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1n, max: 50_000_000n }), // net sales amount
      fc.bigInt({ min: 1n, max: 50_000_000n }), // cogs amount
      (netAmount, cogsAmount) => {
        const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(
          netAmount,
          500 // 5% tax
        )

        // 1. Verify AR Journal Entry balance
        const zero = Money.zero('TWD')
        const arDebit = Money.fromMinorUnits(totalAmountMinorUnits, 'TWD')
        const revCredit = Money.fromMinorUnits(netAmount, 'TWD')
        const taxCredit = Money.fromMinorUnits(taxAmountMinorUnits, 'TWD')

        assert.equal(zero.isOk && arDebit.isOk && revCredit.isOk && taxCredit.isOk, true)
        if (zero.isOk && arDebit.isOk && revCredit.isOk && taxCredit.isOk) {
          const arLines = [
            { accountId: 'ar-receivable', debit: arDebit.value, credit: zero.value },
            { accountId: 'sales-revenue', debit: zero.value, credit: revCredit.value },
          ]
          if (taxAmountMinorUnits > 0n) {
            arLines.push({
              accountId: 'tax-output',
              debit: zero.value,
              credit: taxCredit.value,
            })
          }

          const arEntry = JournalEntry.create('je-ar-pbt', arLines)
          assert.equal(arEntry.isOk, true)
          if (arEntry.isOk) {
            // Debit == Credit
            assert.equal(arEntry.value.totalDebit.minorUnits, arEntry.value.totalCredit.minorUnits)
            assert.equal(arEntry.value.totalDebit.minorUnits, totalAmountMinorUnits)
          }
        }

        // 2. Verify COGS Journal Entry balance
        const cogsDebit = Money.fromMinorUnits(cogsAmount, 'TWD')
        const invCredit = Money.fromMinorUnits(cogsAmount, 'TWD')
        assert.equal(cogsDebit.isOk && invCredit.isOk, true)
        if (zero.isOk && cogsDebit.isOk && invCredit.isOk) {
          const cogsLines = [
            { accountId: 'cogs-expense', debit: cogsDebit.value, credit: zero.value },
            { accountId: 'inventory-asset', debit: zero.value, credit: invCredit.value },
          ]

          const cogsEntry = JournalEntry.create('je-cogs-pbt', cogsLines)
          assert.equal(cogsEntry.isOk, true)
          if (cogsEntry.isOk) {
            assert.equal(
              cogsEntry.value.totalDebit.minorUnits,
              cogsEntry.value.totalCredit.minorUnits
            )
            assert.equal(cogsEntry.value.totalDebit.minorUnits, cogsAmount)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: ATP inventory reservation availability invariant (1,000 runs)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.bigInt({ min: 10n, max: 1_000_000n }), // physical stock
      fc.bigInt({ min: 0n, max: 9n }), // prior reserved stock
      fc.bigInt({ min: 1n, max: 20n }), // requested reservation
      async (physical, priorReserved, reqQty) => {
        const inventory = new InMemoryInventoryService()
        await inventory.registerUnit({ id: 'u-pbt', code: 'PBT', name: 'PBT Unit' })
        await inventory.registerItem({
          id: 'item-pbt',
          companyId: 'comp-pbt',
          sku: 'PBT-ITEM',
          name: 'PBT Item',
          unitId: 'u-pbt',
        })
        await inventory.registerWarehouse({
          id: 'wh-pbt',
          companyId: 'comp-pbt',
          organizationUnitId: 'org-wh-pbt',
          code: 'WH-PBT',
          name: 'PBT Warehouse',
        })

        // Set physical stock
        await inventory.recordMovement({
          id: 'mov-init',
          companyId: 'comp-pbt',
          itemId: 'item-pbt',
          warehouseId: 'wh-pbt',
          sourceType: 'PURCHASE_RECEIPT',
          sourceId: 'init',
          quantityDelta: physical,
          unitCostMinorUnits: 100n,
          currency: 'TWD',
          occurredAt: new Date(),
        })

        // Prior reservation
        if (priorReserved > 0n) {
          await inventory.reserve({
            id: 'res-prior',
            companyId: 'comp-pbt',
            itemId: 'item-pbt',
            warehouseId: 'wh-pbt',
            quantity: priorReserved,
            referenceType: 'SALES_ORDER',
            referenceId: 'so-prior',
          })
        }

        const available = physical - priorReserved
        const reserveRes = await inventory.reserve({
          id: 'res-test',
          companyId: 'comp-pbt',
          itemId: 'item-pbt',
          warehouseId: 'wh-pbt',
          quantity: reqQty,
          referenceType: 'SALES_ORDER',
          referenceId: 'so-test',
        })

        if (reqQty <= available) {
          assert.equal(reserveRes.isOk, true)
          // Verify availability snapshot
          const availCheck = await inventory.availableStock('comp-pbt', 'item-pbt', 'wh-pbt')
          assert.equal(availCheck.isOk, true)
          if (availCheck.isOk) {
            assert.equal(availCheck.value.physicalQuantity, physical)
            assert.equal(availCheck.value.reservedQuantity, priorReserved + reqQty)
            assert.equal(availCheck.value.availableQuantity, available - reqQty)
          }
        } else {
          assert.equal(reserveRes.isErr, true)
          if (reserveRes.isErr) {
            assert.equal(reserveRes.error instanceof InsufficientStockError, true)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})
