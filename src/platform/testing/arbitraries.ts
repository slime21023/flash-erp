import fc from 'fast-check'
import { err, ok } from '../fp/index.js'
import type { Result as ResultType } from '../fp/index.js'
import { DateRange, Decimal, Money, Quantity } from '../kernel/index.js'

export const STANDARD_CURRENCIES = ['TWD', 'USD', 'EUR', 'JPY', 'CNY', 'GBP', 'AUD'] as const

export const STANDARD_UNITS = ['PCS', 'KG', 'M', 'BOX', 'HOUR', 'SET', 'L'] as const

export function currencyArbitrary(): fc.Arbitrary<string> {
  return fc.constantFrom(...STANDARD_CURRENCIES)
}

export function unitArbitrary(): fc.Arbitrary<string> {
  return fc.constantFrom(...STANDARD_UNITS)
}

export function moneyArbitrary(options?: {
  min?: bigint
  max?: bigint
  currency?: string
  currencies?: readonly string[]
}): fc.Arbitrary<Money> {
  const min = options?.min ?? 0n
  const max = options?.max ?? 10_000_000n
  const currencyArb = options?.currency
    ? fc.constant(options.currency)
    : options?.currencies
      ? fc.constantFrom(...options.currencies)
      : currencyArbitrary()

  return fc.tuple(fc.bigInt({ min, max }), currencyArb).map(([amount, currency]) => {
    const res = Money.fromMinorUnits(amount, currency)
    if (res.isErr) {
      throw new Error(`Invalid money generated: ${res.error.message}`)
    }
    return res.value
  })
}

export function quantityArbitrary(options?: {
  min?: bigint
  max?: bigint
  unit?: string
  scale?: number
}): fc.Arbitrary<Quantity> {
  const min = options?.min ?? 0n
  const max = options?.max ?? 1_000_000n
  const scale = options?.scale ?? 3
  const unitArb = options?.unit ? fc.constant(options.unit) : unitArbitrary()

  return fc.tuple(fc.bigInt({ min, max }), unitArb).map(([unscaled, unit]) => {
    const whole = unscaled / 10n ** BigInt(scale)
    const fraction = (unscaled % 10n ** BigInt(scale)).toString().padStart(scale, '0')
    const formatted = scale > 0 ? `${whole}.${fraction}` : whole.toString()
    const res = Quantity.from(formatted, unit, scale)
    if (res.isErr) {
      throw new Error(`Invalid quantity generated: ${res.error.message}`)
    }
    return res.value
  })
}

export function decimalArbitrary(options?: {
  min?: bigint
  max?: bigint
  minScale?: number
  maxScale?: number
}): fc.Arbitrary<Decimal> {
  const min = options?.min ?? -1_000_000n
  const max = options?.max ?? 1_000_000n
  const minScale = options?.minScale ?? 0
  const maxScale = options?.maxScale ?? 4

  return fc
    .tuple(fc.bigInt({ min, max }), fc.integer({ min: minScale, max: maxScale }))
    .map(([unscaled, scale]) => {
      const res = Decimal.fromParts(unscaled, scale)
      if (res.isErr) {
        throw new Error(`Invalid decimal generated: ${res.error.message}`)
      }
      return res.value
    })
}

export function dateRangeArbitrary(options?: {
  minYear?: number
  maxYear?: number
  maxDurationDays?: number
}): fc.Arbitrary<DateRange> {
  const minTs = new Date(`${options?.minYear ?? 2024}-01-01T00:00:00.000Z`).getTime()
  const maxTs = new Date(`${options?.maxYear ?? 2030}-12-31T00:00:00.000Z`).getTime()
  const maxDurationMs = (options?.maxDurationDays ?? 365) * 86_400_000

  return fc
    .tuple(fc.integer({ min: minTs, max: maxTs }), fc.integer({ min: 0, max: maxDurationMs }))
    .map(([startMs, durationMs]) => {
      const start = new Date(startMs)
      const end = new Date(startMs + durationMs)
      const res = DateRange.from(start, end)
      if (res.isErr) {
        throw new Error(`Invalid date range generated: ${res.error.message}`)
      }
      return res.value
    })
}

export function resultArbitrary<T, E>(
  valueArb: fc.Arbitrary<T>,
  errorArb: fc.Arbitrary<E>
): fc.Arbitrary<ResultType<T, E>> {
  return fc
    .boolean()
    .chain(
      (isSuccess): fc.Arbitrary<ResultType<T, E>> =>
        isSuccess
          ? valueArb.map((val): ResultType<T, E> => ok(val))
          : errorArb.map((errVal): ResultType<T, E> => err(errVal))
    )
}
