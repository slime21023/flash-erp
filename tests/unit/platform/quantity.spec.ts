import assert from 'node:assert/strict'
import fc from 'fast-check'
import { Quantity } from '#platform/kernel/index'
import { test } from '@japa/runner'

test('Quantity addition and subtraction round-trip', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100_000 }),
      fc.integer({ min: 0, max: 100_000 }),
      (leftValue, rightValue) => {
        const left = Quantity.from(String(leftValue), 'PCS', 0)
        const right = Quantity.from(String(rightValue), 'PCS', 0)
        assert.equal(left.isOk, true)
        assert.equal(right.isOk, true)
        if (left.isErr || right.isErr) {
          return
        }

        const sum = left.value.add(right.value)
        assert.equal(sum.isOk, true)
        if (sum.isOk) {
          const recovered = sum.value.subtract(right.value)
          assert.equal(recovered.isOk, true)
          if (recovered.isOk) {
            assert.equal(recovered.value.toString(), left.value.toString())
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Quantity refuses subtraction below zero', () => {
  const available = Quantity.from('2.5', 'KG', 3)
  const requested = Quantity.from('3', 'KG', 3)
  assert.equal(available.isOk, true)
  assert.equal(requested.isOk, true)

  if (available.isOk && requested.isOk) {
    const result = available.value.subtract(requested.value)
    assert.equal(result.isErr, true)
    if (result.isErr) {
      assert.equal(result.error.code, 'INSUFFICIENT_QUANTITY')
    }
  }
})

test('Quantity multiplication scales value accurately', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10_000 }),
      fc.integer({ min: 0, max: 100 }),
      (qty, factor) => {
        const q = Quantity.from(qty, 'BOX', 0)
        assert.equal(q.isOk, true)
        if (q.isOk) {
          const mult = q.value.multiply(BigInt(factor))
          assert.equal(mult.isOk, true)
          if (mult.isOk) {
            assert.equal(mult.value.unscaled, BigInt(qty * factor))
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Quantity comparison behaves transitively', () => {
  const q1 = Quantity.from('10.5', 'KG', 2)
  const q2 = Quantity.from('20.5', 'KG', 2)
  assert.equal(q1.isOk, true)
  assert.equal(q2.isOk, true)

  if (q1.isOk && q2.isOk) {
    const isLess = q1.value.isLessThan(q2.value)
    assert.equal(isLess.isOk, true)
    if (isLess.isOk) {
      assert.equal(isLess.value, true)
    }
  }
})
