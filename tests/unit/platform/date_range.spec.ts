import assert from 'node:assert/strict'
import fc from 'fast-check'
import { DateRange, InvalidDateRangeError } from '#platform/kernel/index'
import { test } from '@japa/runner'

// Timestamp between 2020-01-01 and 2030-12-31 UTC
const validDateArb = fc
  .integer({ min: 1577836800000, max: 1924905600000 })
  .map((ts) => new Date(ts))

test('DateRange rejects start after end', () => {
  fc.assert(
    fc.property(validDateArb, fc.integer({ min: 1, max: 100_000_000 }), (start, offsetMs) => {
      const end = new Date(start.getTime() - offsetMs)
      const rangeResult = DateRange.from(start, end)
      assert.equal(rangeResult.isErr, true)
      if (rangeResult.isErr) {
        assert.equal(rangeResult.error instanceof InvalidDateRangeError, true)
        assert.equal(rangeResult.error.code, 'INVALID_DATE_RANGE')
      }
    }),
    { numRuns: 1000 }
  )
})

test('DateRange duration is non-negative and contains both start and end', () => {
  fc.assert(
    fc.property(validDateArb, fc.integer({ min: 0, max: 100_000_000 }), (start, durationMs) => {
      const end = new Date(start.getTime() + durationMs)
      const rangeResult = DateRange.from(start, end)
      assert.equal(rangeResult.isOk, true)

      if (rangeResult.isOk) {
        const range = rangeResult.value
        assert.equal(range.durationInMilliseconds() >= 0, true)
        assert.equal(range.contains(start), true)
        assert.equal(range.contains(end), true)
      }
    }),
    { numRuns: 1000 }
  )
})

test('DateRange overlaps is symmetric', () => {
  fc.assert(
    fc.property(
      validDateArb,
      fc.integer({ min: 0, max: 100_000 }),
      validDateArb,
      fc.integer({ min: 0, max: 100_000 }),
      (s1, d1, s2, d2) => {
        const range1 = DateRange.from(s1, new Date(s1.getTime() + d1))
        const range2 = DateRange.from(s2, new Date(s2.getTime() + d2))
        assert.equal(range1.isOk, true)
        assert.equal(range2.isOk, true)

        if (range1.isOk && range2.isOk) {
          assert.equal(range1.value.overlaps(range2.value), range2.value.overlaps(range1.value))
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('DateRange intersection is commutative when overlapping', () => {
  fc.assert(
    fc.property(
      validDateArb,
      fc.integer({ min: 1000, max: 100_000 }),
      fc.integer({ min: -50_000, max: 50_000 }),
      fc.integer({ min: 1000, max: 100_000 }),
      (s1, d1, offset, d2) => {
        const s2 = new Date(s1.getTime() + offset)
        const range1 = DateRange.from(s1, new Date(s1.getTime() + d1))
        const range2 = DateRange.from(s2, new Date(s2.getTime() + d2))
        assert.equal(range1.isOk, true)
        assert.equal(range2.isOk, true)

        if (range1.isOk && range2.isOk) {
          const inter12 = range1.value.intersection(range2.value)
          const inter21 = range2.value.intersection(range1.value)

          if (inter12 && inter21) {
            assert.equal(inter12.equals(inter21), true)
          } else {
            assert.equal(inter12, null)
            assert.equal(inter21, null)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('DateRange factory methods for day, month, year construct valid periods', () => {
  const day = DateRange.forDay('2026-09-04')
  assert.equal(day.isOk, true)
  if (day.isOk) {
    assert.equal(day.value.start.toISODate(), '2026-09-04')
    assert.equal(day.value.contains('2026-09-04T12:00:00Z'), true)
  }

  const month = DateRange.forMonth(2026, 9)
  assert.equal(month.isOk, true)
  if (month.isOk) {
    assert.equal(month.value.contains('2026-09-15'), true)
    assert.equal(month.value.contains('2026-10-01'), false)
  }

  const year = DateRange.forYear(2026)
  assert.equal(year.isOk, true)
  if (year.isOk) {
    assert.equal(year.value.contains('2026-06-01'), true)
    assert.equal(year.value.contains('2025-12-31'), false)
  }
})
