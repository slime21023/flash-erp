import assert from 'node:assert/strict'
import fc from 'fast-check'
import { Money } from '#platform/kernel/index'
import { test } from '@japa/runner'

test('Money allocation preserves the original total', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 10_000_000n }),
      fc
        .array(fc.bigInt({ min: 0n, max: 10_000n }), { minLength: 1, maxLength: 20 })
        .filter((weights) => weights.some((weight) => weight > 0n)),
      (amount, weights) => {
        const moneyResult = Money.fromMinorUnits(amount, 'TWD')
        assert.equal(moneyResult.isOk, true)
        if (moneyResult.isErr) {
          return
        }

        const allocationResult = moneyResult.value.allocate(weights)
        assert.equal(allocationResult.isOk, true)
        if (allocationResult.isErr) {
          return
        }

        const allocatedTotal = allocationResult.value.reduce(
          (sum, allocation) => sum + allocation.minorUnits,
          0n
        )
        assert.equal(allocatedTotal, amount)
        assert.equal(
          allocationResult.value.every((allocation) => allocation.currency === 'TWD'),
          true
        )
      }
    ),
    { numRuns: 1000 }
  )
})

test('Money rejects mixed currencies without throwing', () => {
  const twd = Money.fromMinorUnits(100n, 'TWD')
  const usd = Money.fromMinorUnits(100n, 'USD')
  assert.equal(twd.isOk, true)
  assert.equal(usd.isOk, true)

  if (twd.isOk && usd.isOk) {
    const result = twd.value.add(usd.value)
    assert.equal(result.isErr, true)
    if (result.isErr) {
      assert.equal(result.error.code, 'CURRENCY_MISMATCH')
    }
  }
})

test('Money multiplication scales minor units linearly', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 100_000n }),
      fc.bigInt({ min: 0n, max: 100n }),
      (amount, factor) => {
        const money = Money.fromMinorUnits(amount, 'TWD')
        assert.equal(money.isOk, true)
        if (money.isOk) {
          const multiplied = money.value.multiply(factor)
          assert.equal(multiplied.isOk, true)
          if (multiplied.isOk) {
            assert.equal(multiplied.value.minorUnits, amount * factor)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Money comparison and formatting behave consistently', () => {
  const m100 = Money.fromMinorUnits(10000n, 'TWD')
  const m200 = Money.fromMinorUnits(20000n, 'TWD')
  assert.equal(m100.isOk, true)
  assert.equal(m200.isOk, true)

  if (m100.isOk && m200.isOk) {
    const less = m100.value.isLessThan(m200.value)
    assert.equal(less.isOk, true)
    if (less.isOk) {
      assert.equal(less.value, true)
    }

    assert.equal(m100.value.format(), '100.00 TWD')
  }
})
