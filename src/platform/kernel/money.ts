import { DomainError, err, ok } from '../fp/index.js'
import type { Result } from '../fp/index.js'
import { Decimal } from './decimal.js'
import type { RoundingMode } from './decimal.js'

const currencyPattern = /^[A-Z]{3}$/
const integerPattern = /^-?(?:0|[1-9]\d*)$/
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY'

  constructor(message: string) {
    super(message)
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH'

  constructor(
    readonly leftCurrency: string,
    readonly rightCurrency: string
  ) {
    super(`Cannot combine ${leftCurrency} with ${rightCurrency}`)
  }
}

export class MoneyAllocationError extends DomainError {
  readonly code = 'INVALID_MONEY_ALLOCATION'

  constructor(message: string) {
    super(message)
  }
}

export class Money {
  readonly #minorUnits: bigint
  readonly #currency: string

  private constructor(minorUnits: bigint, currency: string) {
    this.#minorUnits = minorUnits
    this.#currency = currency
    Object.freeze(this)
  }

  static fromMinorUnits(
    minorUnits: bigint | number | string,
    currency: string
  ): Result<Money, InvalidMoneyError> {
    const normalizedCurrency = currency.trim().toUpperCase()
    if (!currencyPattern.test(normalizedCurrency)) {
      return err(new InvalidMoneyError(`Invalid currency code: ${currency}`))
    }

    const parsedMinorUnits = Money.parseInteger(minorUnits)
    if (parsedMinorUnits === undefined) {
      return err(new InvalidMoneyError(`Invalid minor units: ${String(minorUnits)}`))
    }

    return ok(new Money(parsedMinorUnits, normalizedCurrency))
  }

  static zero(currency: string): Result<Money, InvalidMoneyError> {
    return Money.fromMinorUnits(0n, currency)
  }

  static fromDecimal(
    amount: bigint | number | string,
    currency: string,
    fractionDigits = 2
  ): Result<Money, InvalidMoneyError> {
    if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 18) {
      return err(new InvalidMoneyError(`Invalid fraction digits: ${fractionDigits}`))
    }

    const value = typeof amount === 'number' ? String(amount) : amount.toString()
    if (!decimalPattern.test(value)) {
      return err(new InvalidMoneyError(`Invalid decimal amount: ${value}`))
    }

    const negative = value.startsWith('-')
    const unsignedValue = negative ? value.slice(1) : value
    const [whole = '', fraction = ''] = unsignedValue.split('.')
    if (fraction.length > fractionDigits) {
      return err(new InvalidMoneyError(`Too many decimal places: ${value}`))
    }

    const scale = 10n ** BigInt(fractionDigits)
    const minorUnits = BigInt(whole) * scale + BigInt(fraction.padEnd(fractionDigits, '0') || '0')

    return Money.fromMinorUnits(negative ? -minorUnits : minorUnits, currency)
  }

  get minorUnits(): bigint {
    return this.#minorUnits
  }

  get currency(): string {
    return this.#currency
  }

  isZero(): boolean {
    return this.#minorUnits === 0n
  }

  isPositive(): boolean {
    return this.#minorUnits > 0n
  }

  isNegative(): boolean {
    return this.#minorUnits < 0n
  }

  add(other: Money): Result<Money, CurrencyMismatchError> {
    const currencyResult = this.ensureCurrency(other)
    if (currencyResult.isErr) {
      return err(currencyResult.error)
    }

    return ok(new Money(this.#minorUnits + other.#minorUnits, this.#currency))
  }

  subtract(other: Money): Result<Money, CurrencyMismatchError> {
    const currencyResult = this.ensureCurrency(other)
    if (currencyResult.isErr) {
      return err(currencyResult.error)
    }

    return ok(new Money(this.#minorUnits - other.#minorUnits, this.#currency))
  }

  multiply(
    factor: Decimal | bigint | number,
    roundingMode: RoundingMode = 'HALF_UP'
  ): Result<Money, InvalidMoneyError> {
    if (typeof factor === 'bigint') {
      return ok(new Money(this.#minorUnits * factor, this.#currency))
    }

    let decimalFactor: Decimal
    if (factor instanceof Decimal) {
      decimalFactor = factor
    } else {
      const parsed = Decimal.from(factor)
      if (parsed.isErr) {
        return err(new InvalidMoneyError(`Invalid multiplication factor: ${factor}`))
      }
      decimalFactor = parsed.value
    }

    const productUnscaled = this.#minorUnits * decimalFactor.unscaled
    const decimalProduct = Decimal.fromParts(productUnscaled, decimalFactor.scale)
    if (decimalProduct.isErr) {
      return err(new InvalidMoneyError(decimalProduct.error.message))
    }

    const rounded = decimalProduct.value.round(0, roundingMode)
    if (rounded.isErr) {
      return err(new InvalidMoneyError(rounded.error.message))
    }

    return ok(new Money(rounded.value.unscaled, this.#currency))
  }

  percentage(
    rate: Decimal | number,
    roundingMode: RoundingMode = 'HALF_UP'
  ): Result<Money, InvalidMoneyError> {
    const divisor = Decimal.from(100)
    if (divisor.isErr) {
      return err(new InvalidMoneyError('Percentage divisor creation failed'))
    }

    let decimalRate: Decimal
    if (rate instanceof Decimal) {
      decimalRate = rate
    } else {
      const parsed = Decimal.from(rate)
      if (parsed.isErr) {
        return err(new InvalidMoneyError(`Invalid percentage rate: ${rate}`))
      }
      decimalRate = parsed.value
    }

    const factor = decimalRate.divide(divisor.value, 6, roundingMode)
    if (factor.isErr) {
      return err(new InvalidMoneyError(factor.error.message))
    }

    return this.multiply(factor.value, roundingMode)
  }

  compare(other: Money): Result<-1 | 0 | 1, CurrencyMismatchError> {
    const currencyResult = this.ensureCurrency(other)
    if (currencyResult.isErr) {
      return err(currencyResult.error)
    }

    if (this.#minorUnits === other.#minorUnits) return ok(0)
    return ok(this.#minorUnits < other.#minorUnits ? -1 : 1)
  }

  isGreaterThan(other: Money): Result<boolean, CurrencyMismatchError> {
    return this.compare(other).map((cmp) => cmp === 1)
  }

  isLessThan(other: Money): Result<boolean, CurrencyMismatchError> {
    return this.compare(other).map((cmp) => cmp === -1)
  }

  allocate(weights: readonly bigint[]): Result<readonly Money[], MoneyAllocationError> {
    if (this.#minorUnits < 0n || weights.length === 0 || weights.some((weight) => weight < 0n)) {
      return err(new MoneyAllocationError('Allocation requires a non-negative amount and weights'))
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n)
    if (totalWeight === 0n) {
      return err(new MoneyAllocationError('At least one allocation weight must be positive'))
    }

    const allocations = weights.map((weight) => (this.#minorUnits * weight) / totalWeight)
    const remainders = weights
      .map((weight, index) => ({
        index,
        remainder: (this.#minorUnits * weight) % totalWeight,
      }))
      .sort((left, right) => {
        if (left.remainder === right.remainder) {
          return left.index - right.index
        }

        return left.remainder > right.remainder ? -1 : 1
      })

    const remainder = this.#minorUnits - allocations.reduce((sum, value) => sum + value, 0n)
    for (let index = 0; index < Number(remainder); index += 1) {
      const allocationIndex = remainders[index]?.index
      if (allocationIndex !== undefined) {
        allocations[allocationIndex] = (allocations[allocationIndex] ?? 0n) + 1n
      }
    }

    return ok(allocations.map((allocation) => new Money(allocation, this.#currency)))
  }

  equals(other: Money): boolean {
    return this.#minorUnits === other.#minorUnits && this.#currency === other.#currency
  }

  format(fractionDigits = 2): string {
    const divisor = 10n ** BigInt(fractionDigits)
    const absoluteMinorUnits = this.#minorUnits < 0n ? -this.#minorUnits : this.#minorUnits
    const whole = absoluteMinorUnits / divisor
    const fraction = (absoluteMinorUnits % divisor).toString().padStart(fractionDigits, '0')
    const sign = this.#minorUnits < 0n ? '-' : ''
    return `${sign}${whole}.${fraction} ${this.#currency}`
  }

  toJSON(): { minorUnits: string; currency: string } {
    return { minorUnits: this.#minorUnits.toString(), currency: this.#currency }
  }

  private ensureCurrency(other: Money): Result<true, CurrencyMismatchError> {
    if (this.#currency !== other.#currency) {
      return err(new CurrencyMismatchError(this.#currency, other.#currency))
    }

    return ok(true)
  }

  private static parseInteger(value: bigint | number | string): bigint | undefined {
    if (typeof value === 'bigint') {
      return value
    }

    if (typeof value === 'number') {
      return Number.isSafeInteger(value) ? BigInt(value) : undefined
    }

    return integerPattern.test(value) ? BigInt(value) : undefined
  }
}
