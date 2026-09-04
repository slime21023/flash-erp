import assert from 'node:assert/strict'
import fc from 'fast-check'
import { Decimal, DivisionByZeroError } from '#platform/kernel/index'
import { test } from '@japa/runner'

test('Decimal addition is commutative', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }),
      fc.integer({ min: 0, max: 6 }),
      fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }),
      fc.integer({ min: 0, max: 6 }),
      (unscaledA, scaleA, unscaledB, scaleB) => {
        const decA = Decimal.fromParts(unscaledA, scaleA)
        const decB = Decimal.fromParts(unscaledB, scaleB)
        assert.equal(decA.isOk, true)
        assert.equal(decB.isOk, true)

        if (decA.isOk && decB.isOk) {
          const sumAB = decA.value.add(decB.value)
          const sumBA = decB.value.add(decA.value)
          assert.equal(sumAB.equals(sumBA), true)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Decimal subtraction is the inverse of addition', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
      fc.integer({ min: 0, max: 4 }),
      fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
      fc.integer({ min: 0, max: 4 }),
      (unscaledA, scaleA, unscaledB, scaleB) => {
        const decA = Decimal.fromParts(unscaledA, scaleA)
        const decB = Decimal.fromParts(unscaledB, scaleB)
        assert.equal(decA.isOk, true)
        assert.equal(decB.isOk, true)

        if (decA.isOk && decB.isOk) {
          const sum = decA.value.add(decB.value)
          const diff = sum.subtract(decB.value)
          assert.equal(diff.equals(decA.value), true)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Decimal multiplication is commutative', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: -100_000n, max: 100_000n }),
      fc.integer({ min: 0, max: 3 }),
      fc.bigInt({ min: -100_000n, max: 100_000n }),
      fc.integer({ min: 0, max: 3 }),
      (unscaledA, scaleA, unscaledB, scaleB) => {
        const decA = Decimal.fromParts(unscaledA, scaleA)
        const decB = Decimal.fromParts(unscaledB, scaleB)
        assert.equal(decA.isOk, true)
        assert.equal(decB.isOk, true)

        if (decA.isOk && decB.isOk) {
          const prodAB = decA.value.multiply(decB.value)
          const prodBA = decB.value.multiply(decA.value)
          assert.equal(prodAB.equals(prodBA), true)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Decimal division by zero returns DivisionByZeroError', () => {
  const dec = Decimal.fromParts(100n, 2)
  const zero = Decimal.zero()
  assert.equal(dec.isOk, true)

  if (dec.isOk) {
    const result = dec.value.divide(zero)
    assert.equal(result.isErr, true)
    if (result.isErr) {
      assert.equal(result.error instanceof DivisionByZeroError, true)
      assert.equal(result.error.code, 'DIVISION_BY_ZERO')
    }
  }
})

test('Decimal Banker rounding (HALF_EVEN) avoids upward bias', () => {
  // 2.5 rounded to scale 0 with HALF_EVEN is 2 (even)
  const twoPointFive = Decimal.from('2.5')
  assert.equal(twoPointFive.isOk, true)
  if (twoPointFive.isOk) {
    const rounded = twoPointFive.value.round(0, 'HALF_EVEN')
    assert.equal(rounded.isOk, true)
    if (rounded.isOk) {
      assert.equal(rounded.value.toString(), '2')
    }
  }

  // 3.5 rounded to scale 0 with HALF_EVEN is 4 (even)
  const threePointFive = Decimal.from('3.5')
  assert.equal(threePointFive.isOk, true)
  if (threePointFive.isOk) {
    const rounded = threePointFive.value.round(0, 'HALF_EVEN')
    assert.equal(rounded.isOk, true)
    if (rounded.isOk) {
      assert.equal(rounded.value.toString(), '4')
    }
  }

  // 2.5 rounded to scale 0 with HALF_UP is 3
  if (twoPointFive.isOk) {
    const roundedUp = twoPointFive.value.round(0, 'HALF_UP')
    assert.equal(roundedUp.isOk, true)
    if (roundedUp.isOk) {
      assert.equal(roundedUp.value.toString(), '3')
    }
  }
})

test('Decimal comparison behaves transitively', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -1000, max: 1000 }),
      fc.integer({ min: -1000, max: 1000 }),
      fc.integer({ min: -1000, max: 1000 }),
      (a, b, c) => {
        const decA = Decimal.from(a)
        const decB = Decimal.from(b)
        const decC = Decimal.from(c)
        assert.equal(decA.isOk, true)
        assert.equal(decB.isOk, true)
        assert.equal(decC.isOk, true)

        if (decA.isOk && decB.isOk && decC.isOk) {
          if (decA.value.isLessThan(decB.value) && decB.value.isLessThan(decC.value)) {
            assert.equal(decA.value.isLessThan(decC.value), true)
          }
          assert.equal(decA.value.equals(decB.value), a === b)
        }
      }
    ),
    { numRuns: 1000 }
  )
})
