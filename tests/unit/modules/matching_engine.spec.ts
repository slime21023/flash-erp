import assert from 'node:assert/strict'
import fc from 'fast-check'
import { test } from 'vitest'
import { Money } from '@platform/kernel/index.js'
import {
  ThreeWayMatcher,
  calculateTaxAndTotal,
} from '@modules/procurement/services/three_way_matcher.js'
import type {
  PurchaseOrderLineInput,
  VendorInvoiceSnapshot,
} from '@modules/procurement/contracts/index.js'

test('ThreeWayMatcher: tax and total calculation preserves Net + Tax == Total invariant (PBT 1000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 100_000_000n }),
      fc.integer({ min: 0, max: 2000 }), // 0% to 20%
      (netAmount, taxBps) => {
        const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(
          netAmount,
          taxBps
        )
        assert.equal(totalAmountMinorUnits, netAmount + taxAmountMinorUnits)
        assert.equal(taxAmountMinorUnits >= 0n, true)
      }
    ),
    { numRuns: 1000 }
  )
})

test('ThreeWayMatcher: exact match between PO, GR, and Invoice always succeeds (PBT 1000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1n, max: 10_000n }), // quantity
      fc.bigInt({ min: 1n, max: 100_000n }), // unit cost
      (qty, unitCost) => {
        const poLines: PurchaseOrderLineInput[] = [
          {
            itemId: 'item-bolt',
            orderedQuantity: qty,
            unitCostMinorUnits: unitCost,
            currency: 'TWD',
          },
        ]
        const receiptLines = [{ itemId: 'item-bolt', receivedQuantity: qty }]
        const lineTotal = qty * unitCost
        const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(lineTotal, 500)

        const invoice: VendorInvoiceSnapshot = {
          id: 'inv-test',
          companyId: 'comp-1',
          supplierId: 'supp-1',
          purchaseOrderId: 'po-test',
          invoiceNumber: 'INV-001',
          invoiceDate: '2026-09-10',
          currency: 'TWD',
          taxRateBasisPoints: 500,
          netAmountMinorUnits: lineTotal,
          taxAmountMinorUnits,
          totalAmountMinorUnits,
          status: 'RECEIVED',
          lines: [
            {
              itemId: 'item-bolt',
              invoicedQuantity: qty,
              unitPriceMinorUnits: unitCost,
              lineTotalMinorUnits: lineTotal,
            },
          ],
        }

        const matchRes = ThreeWayMatcher.match(poLines, receiptLines, invoice, {
          quantityToleranceBasisPoints: 0,
          priceToleranceBasisPoints: 0,
          amountToleranceMinorUnits: 0n,
        })

        assert.equal(matchRes.isOk, true)
        if (matchRes.isOk) {
          assert.equal(matchRes.value.isMatched, true)
          assert.equal(matchRes.value.status, 'MATCHED')
          assert.equal(matchRes.value.lineMatches.length, 1)
          assert.equal(matchRes.value.lineMatches[0]!.quantityDiscrepancy, 0n)
          assert.equal(matchRes.value.lineMatches[0]!.priceDiscrepancyMinorUnits, 0n)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('ThreeWayMatcher: quantity within tolerance passes, exceeding tolerance fails (PBT 1000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 100n, max: 10_000n }), // base received quantity
      fc.integer({ min: 1, max: 20 }), // tolerance percent (e.g. 5%)
      fc.boolean(), // whether to test within tolerance (true) or exceeding tolerance (false)
      (baseQty, tolPercent, withinTolerance) => {
        const tolBps = tolPercent * 100
        const maxAllowedDelta = (baseQty * BigInt(tolBps)) / 10000n
        const delta = withinTolerance ? maxAllowedDelta : maxAllowedDelta + 1n
        const invoicedQty = baseQty + delta

        const unitCost = 100n
        const lineTotal = invoicedQty * unitCost
        const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(lineTotal, 500)

        const poLines: PurchaseOrderLineInput[] = [
          {
            itemId: 'item-1',
            orderedQuantity: invoicedQty + 100n,
            unitCostMinorUnits: unitCost,
            currency: 'TWD',
          },
        ]
        const receiptLines = [{ itemId: 'item-1', receivedQuantity: baseQty }]

        const invoice: VendorInvoiceSnapshot = {
          id: 'inv-qty-test',
          companyId: 'comp-1',
          supplierId: 'supp-1',
          purchaseOrderId: 'po-1',
          invoiceNumber: 'INV-QTY',
          invoiceDate: '2026-09-10',
          currency: 'TWD',
          taxRateBasisPoints: 500,
          netAmountMinorUnits: lineTotal,
          taxAmountMinorUnits,
          totalAmountMinorUnits,
          status: 'RECEIVED',
          lines: [
            {
              itemId: 'item-1',
              invoicedQuantity: invoicedQty,
              unitPriceMinorUnits: unitCost,
              lineTotalMinorUnits: lineTotal,
            },
          ],
        }

        const matchRes = ThreeWayMatcher.match(poLines, receiptLines, invoice, {
          quantityToleranceBasisPoints: tolBps,
        })

        if (withinTolerance) {
          assert.equal(matchRes.isOk, true)
        } else {
          assert.equal(matchRes.isErr, true)
          if (matchRes.isErr) {
            assert.equal(matchRes.error.code, 'MATCHING_TOLERANCE_EXCEEDED')
            assert.equal(matchRes.error.details.field, 'QUANTITY')
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('ThreeWayMatcher: unit price within tolerance passes, exceeding tolerance fails (PBT 1000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1000n, max: 100_000n }), // base PO unit price
      fc.integer({ min: 1, max: 20 }), // tolerance percent
      fc.boolean(), // within tolerance vs exceeding tolerance
      (basePrice, tolPercent, withinTolerance) => {
        const tolBps = tolPercent * 100
        const maxAllowedDelta = (basePrice * BigInt(tolBps)) / 10000n
        const delta = withinTolerance ? maxAllowedDelta : maxAllowedDelta + 1n
        const invoicedPrice = basePrice + delta

        const qty = 10n
        const lineTotal = qty * invoicedPrice
        const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(lineTotal, 500)

        const poLines: PurchaseOrderLineInput[] = [
          {
            itemId: 'item-price',
            orderedQuantity: qty,
            unitCostMinorUnits: basePrice,
            currency: 'TWD',
          },
        ]
        const receiptLines = [{ itemId: 'item-price', receivedQuantity: qty }]

        const invoice: VendorInvoiceSnapshot = {
          id: 'inv-price-test',
          companyId: 'comp-1',
          supplierId: 'supp-1',
          purchaseOrderId: 'po-1',
          invoiceNumber: 'INV-PRICE',
          invoiceDate: '2026-09-10',
          currency: 'TWD',
          taxRateBasisPoints: 500,
          netAmountMinorUnits: lineTotal,
          taxAmountMinorUnits,
          totalAmountMinorUnits,
          status: 'RECEIVED',
          lines: [
            {
              itemId: 'item-price',
              invoicedQuantity: qty,
              unitPriceMinorUnits: invoicedPrice,
              lineTotalMinorUnits: lineTotal,
            },
          ],
        }

        const matchRes = ThreeWayMatcher.match(poLines, receiptLines, invoice, {
          priceToleranceBasisPoints: tolBps,
        })

        if (withinTolerance) {
          assert.equal(matchRes.isOk, true)
        } else {
          assert.equal(matchRes.isErr, true)
          if (matchRes.isErr) {
            assert.equal(matchRes.error.code, 'MATCHING_TOLERANCE_EXCEEDED')
            assert.equal(matchRes.error.details.field, 'UNIT_PRICE')
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('ThreeWayMatcher: double-entry AP voucher balance invariant (PBT 1000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1n, max: 10_000_000n }), // net amount
      (netAmount) => {
        const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(netAmount, 500)

        const debitInventory = Money.fromMinorUnits(netAmount, 'TWD')
        const debitTax = Money.fromMinorUnits(taxAmountMinorUnits, 'TWD')
        const creditAp = Money.fromMinorUnits(totalAmountMinorUnits, 'TWD')

        assert.equal(debitInventory.isOk, true)
        assert.equal(debitTax.isOk, true)
        assert.equal(creditAp.isOk, true)

        if (debitInventory.isOk && debitTax.isOk && creditAp.isOk) {
          const totalDebit = debitInventory.value.minorUnits + debitTax.value.minorUnits
          const totalCredit = creditAp.value.minorUnits
          assert.equal(totalDebit, totalCredit)
        }
      }
    ),
    { numRuns: 1000 }
  )
})
