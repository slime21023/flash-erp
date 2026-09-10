import { DomainError, err, ok } from '../fp/index.js'
import type { Result } from '../fp/index.js'

const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'TRUNCATE' | 'CEIL' | 'FLOOR'

export class InvalidDecimalError extends DomainError {
  readonly code = 'INVALID_DECIMAL'

  constructor(message: string) {
    super(message)
  }
}

export class DivisionByZeroError extends DomainError {
  readonly code = 'DIVISION_BY_ZERO'

  constructor() {
    super('Division by zero is not permitted')
  }
}

export class Decimal {
  readonly #unscaled: bigint
  readonly #scale: number

  private constructor(unscaled: bigint, scale: number) {
    this.#unscaled = unscaled
    this.#scale = scale
    Object.freeze(this)
  }

  static from(
    value: bigint | number | string,
    targetScale?: number
  ): Result<Decimal, InvalidDecimalError> {
    const stringValue = typeof value === 'number' ? String(value) : value.toString().trim()
    if (!decimalPattern.test(stringValue)) {
      return err(new InvalidDecimalError(`Invalid decimal value: ${stringValue}`))
    }

    const negative = stringValue.startsWith('-')
    const unsignedValue = negative ? stringValue.slice(1) : stringValue
    const [whole = '', fraction = ''] = unsignedValue.split('.')

    const parsedScale = fraction.length
    if (parsedScale > 18) {
      return err(new InvalidDecimalError(`Decimal scale exceeds maximum of 18: ${stringValue}`))
    }

    const unscaledRaw = BigInt(whole + fraction)
    const unscaled = negative ? -unscaledRaw : unscaledRaw

    const decimal = new Decimal(unscaled, parsedScale)
    if (targetScale !== undefined) {
      return decimal.round(targetScale, 'HALF_UP')
    }

    return ok(decimal)
  }

  static fromParts(unscaled: bigint, scale: number): Result<Decimal, InvalidDecimalError> {
    if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
      return err(new InvalidDecimalError(`Invalid decimal scale: ${scale}`))
    }

    return ok(new Decimal(unscaled, scale))
  }

  static zero(scale = 0): Decimal {
    return new Decimal(0n, scale)
  }

  static one(scale = 0): Decimal {
    return new Decimal(10n ** BigInt(scale), scale)
  }

  get unscaled(): bigint {
    return this.#unscaled
  }

  get scale(): number {
    return this.#scale
  }

  isZero(): boolean {
    return this.#unscaled === 0n
  }

  isPositive(): boolean {
    return this.#unscaled > 0n
  }

  isNegative(): boolean {
    return this.#unscaled < 0n
  }

  abs(): Decimal {
    return this.#unscaled < 0n ? new Decimal(-this.#unscaled, this.#scale) : this
  }

  negate(): Decimal {
    return new Decimal(-this.#unscaled, this.#scale)
  }

  add(other: Decimal): Decimal {
    const maxScale = Math.max(this.#scale, other.#scale)
    const left = Decimal.rescale(this.#unscaled, this.#scale, maxScale)
    const right = Decimal.rescale(other.#unscaled, other.#scale, maxScale)
    return new Decimal(left + right, maxScale)
  }

  subtract(other: Decimal): Decimal {
    const maxScale = Math.max(this.#scale, other.#scale)
    const left = Decimal.rescale(this.#unscaled, this.#scale, maxScale)
    const right = Decimal.rescale(other.#unscaled, other.#scale, maxScale)
    return new Decimal(left - right, maxScale)
  }

  multiply(other: Decimal, targetScale?: number): Decimal {
    const productUnscaled = this.#unscaled * other.#unscaled
    const combinedScale = this.#scale + other.#scale
    const product = new Decimal(productUnscaled, combinedScale)

    if (targetScale !== undefined) {
      const rounded = product.round(targetScale, 'HALF_UP')
      return rounded.isOk ? rounded.value : product
    }

    return product
  }

  divide(
    other: Decimal,
    targetScale = 4,
    roundingMode: RoundingMode = 'HALF_EVEN'
  ): Result<Decimal, DivisionByZeroError | InvalidDecimalError> {
    if (other.isZero()) {
      return err(new DivisionByZeroError())
    }

    if (!Number.isInteger(targetScale) || targetScale < 0 || targetScale > 18) {
      return err(new InvalidDecimalError(`Invalid target scale: ${targetScale}`))
    }

    // Align scales: dividend * 10^(targetScale + extraPrecision) / divisor
    // Add extra precision digit for accurate rounding
    const extraScale = targetScale + 1
    const shift = extraScale + other.#scale - this.#scale
    let dividend: bigint

    if (shift >= 0) {
      dividend = this.#unscaled * 10n ** BigInt(shift)
    } else {
      dividend = this.#unscaled / 10n ** BigInt(-shift)
    }

    const quotient = dividend / other.#unscaled
    const intermediate = new Decimal(quotient, extraScale)
    return intermediate.round(targetScale, roundingMode)
  }

  round(targetScale: number, mode: RoundingMode = 'HALF_UP'): Result<Decimal, InvalidDecimalError> {
    if (!Number.isInteger(targetScale) || targetScale < 0 || targetScale > 18) {
      return err(new InvalidDecimalError(`Invalid target scale: ${targetScale}`))
    }

    if (this.#scale === targetScale) {
      return ok(this)
    }

    if (this.#scale < targetScale) {
      const upscaled = Decimal.rescale(this.#unscaled, this.#scale, targetScale)
      return ok(new Decimal(upscaled, targetScale))
    }

    const diff = this.#scale - targetScale
    const divisor = 10n ** BigInt(diff)
    let quotient = this.#unscaled / divisor
    const remainder = this.#unscaled % divisor

    if (remainder === 0n) {
      return ok(new Decimal(quotient, targetScale))
    }

    const absRemainder = remainder < 0n ? -remainder : remainder
    const halfDivisor = divisor / 2n
    const isNegative = this.#unscaled < 0n

    switch (mode) {
      case 'TRUNCATE':
        // integer division already truncates towards zero
        break

      case 'CEIL':
        if (!isNegative && remainder > 0n) {
          quotient += 1n
        }
        break

      case 'FLOOR':
        if (isNegative && remainder < 0n) {
          quotient -= 1n
        }
        break

      case 'HALF_UP':
        if (absRemainder >= halfDivisor) {
          quotient += isNegative ? -1n : 1n
        }
        break

      case 'HALF_EVEN':
        if (absRemainder > halfDivisor) {
          quotient += isNegative ? -1n : 1n
        } else if (absRemainder === halfDivisor) {
          // Exactly halfway: round to even quotient
          const isOdd = (quotient < 0n ? -quotient : quotient) % 2n === 1n
          if (isOdd) {
            quotient += isNegative ? -1n : 1n
          }
        }
        break
    }

    return ok(new Decimal(quotient, targetScale))
  }

  compare(other: Decimal): -1 | 0 | 1 {
    const maxScale = Math.max(this.#scale, other.#scale)
    const left = Decimal.rescale(this.#unscaled, this.#scale, maxScale)
    const right = Decimal.rescale(other.#unscaled, other.#scale, maxScale)
    if (left === right) return 0
    return left < right ? -1 : 1
  }

  equals(other: Decimal): boolean {
    return this.compare(other) === 0
  }

  isGreaterThan(other: Decimal): boolean {
    return this.compare(other) === 1
  }

  isLessThan(other: Decimal): boolean {
    return this.compare(other) === -1
  }

  isGreaterThanOrEqual(other: Decimal): boolean {
    return this.compare(other) >= 0
  }

  isLessThanOrEqual(other: Decimal): boolean {
    return this.compare(other) <= 0
  }

  toString(): string {
    if (this.#scale === 0) {
      return this.#unscaled.toString()
    }

    const negative = this.#unscaled < 0n
    const abs = negative ? -this.#unscaled : this.#unscaled
    const raw = abs.toString().padStart(this.#scale + 1, '0')
    const whole = raw.slice(0, -this.#scale)
    const fraction = raw.slice(-this.#scale)

    return `${negative ? '-' : ''}${whole}.${fraction}`
  }

  toNumber(): number {
    return Number(this.toString())
  }

  toJSON(): { value: string; unscaled: string; scale: number } {
    return {
      value: this.toString(),
      unscaled: this.#unscaled.toString(),
      scale: this.#scale,
    }
  }

  private static rescale(value: bigint, fromScale: number, toScale: number): bigint {
    if (fromScale === toScale) return value
    return value * 10n ** BigInt(toScale - fromScale)
  }
}
