import assert from 'node:assert/strict'
import fc from 'fast-check'
import {
  dateRangeArbitrary,
  decimalArbitrary,
  moneyArbitrary,
  quantityArbitrary,
  resultArbitrary,
} from '#platform/testing/index'
import { test } from '@japa/runner'

test('moneyArbitrary generates valid immutable Money instances', () => {
  fc.assert(
    fc.property(moneyArbitrary({ min: 100n, max: 50_000n, currency: 'TWD' }), (money) => {
      assert.equal(money.currency, 'TWD')
      assert.equal(money.minorUnits >= 100n && money.minorUnits <= 50_000n, true)
      assert.equal(Object.isFrozen(money), true)
    }),
    { numRuns: 1000 }
  )
})

test('quantityArbitrary generates valid immutable Quantity instances', () => {
  fc.assert(
    fc.property(quantityArbitrary({ min: 0n, max: 100_000n, unit: 'KG', scale: 3 }), (quantity) => {
      assert.equal(quantity.unit, 'KG')
      assert.equal(quantity.scale, 3)
      assert.equal(quantity.unscaled >= 0n && quantity.unscaled <= 100_000n, true)
      assert.equal(Object.isFrozen(quantity), true)
    }),
    { numRuns: 1000 }
  )
})

test('decimalArbitrary generates valid immutable Decimal instances', () => {
  fc.assert(
    fc.property(
      decimalArbitrary({ min: -5000n, max: 5000n, minScale: 1, maxScale: 4 }),
      (decimal) => {
        assert.equal(decimal.scale >= 1 && decimal.scale <= 4, true)
        assert.equal(decimal.unscaled >= -5000n && decimal.unscaled <= 5000n, true)
        assert.equal(Object.isFrozen(decimal), true)
      }
    ),
    { numRuns: 1000 }
  )
})

test('dateRangeArbitrary generates valid immutable DateRange instances', () => {
  fc.assert(
    fc.property(dateRangeArbitrary({ minYear: 2025, maxYear: 2028 }), (range) => {
      assert.equal(range.start <= range.end, true)
      assert.equal(range.durationInMilliseconds() >= 0, true)
      assert.equal(Object.isFrozen(range), true)
    }),
    { numRuns: 1000 }
  )
})

test('resultArbitrary alternates between Ok and Err branches', () => {
  fc.assert(
    fc.property(resultArbitrary(fc.integer(), fc.string()), (result) => {
      if (result.isOk) {
        assert.equal(typeof result.value, 'number')
        assert.equal(result.isErr, false)
      } else {
        assert.equal(typeof result.error, 'string')
        assert.equal(result.isOk, false)
      }
    }),
    { numRuns: 1000 }
  )
})
