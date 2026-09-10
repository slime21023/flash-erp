import { DomainError, err, ok } from '../fp/index.js'
import type { Result } from '../fp/index.js'
import { Decimal } from './decimal.js'

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/
const unitPattern = /^[A-Z][A-Z0-9_-]*$/

export class InvalidQuantityError extends DomainError {
  readonly code = 'INVALID_QUANTITY'

  constructor(message: string) {
    super(message)
  }
}

export class QuantityUnitMismatchError extends DomainError {
  readonly code = 'QUANTITY_UNIT_MISMATCH'

  constructor(
    readonly leftUnit: string,
    readonly rightUnit: string
  ) {
    super(`Cannot combine ${leftUnit} with ${rightUnit}`)
  }
}

export class InsufficientQuantityError extends DomainError {
  readonly code = 'INSUFFICIENT_QUANTITY'

  constructor(
    readonly requested: string,
    readonly available: string,
    readonly unit: string
  ) {
    super(`Insufficient ${unit}: requested ${requested}, available ${available}`)
  }
}

export class Quantity {
  readonly #unscaled: bigint
  readonly #scale: number
  readonly #unit: string

  private constructor(unscaled: bigint, scale: number, unit: string) {
    this.#unscaled = unscaled
    this.#scale = scale
    this.#unit = unit
    Object.freeze(this)
  }

  static from(
    value: bigint | number | string,
    unit: string,
    scale = 3
  ): Result<Quantity, InvalidQuantityError> {
    const normalizedUnit = unit.trim().toUpperCase()
    if (!unitPattern.test(normalizedUnit)) {
      return err(new InvalidQuantityError(`Invalid quantity unit: ${unit}`))
    }

    if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
      return err(new InvalidQuantityError(`Invalid quantity scale: ${scale}`))
    }

    const stringValue = typeof value === 'number' ? String(value) : value.toString()
    if (typeof value === 'bigint' && value < 0n) {
      return err(new InvalidQuantityError(`Quantity cannot be negative: ${stringValue}`))
    }

    if (!decimalPattern.test(stringValue)) {
      return err(new InvalidQuantityError(`Invalid quantity value: ${stringValue}`))
    }

    const [whole = '', fraction = ''] = stringValue.split('.')
    if (fraction.length > scale) {
      return err(new InvalidQuantityError(`Too many decimal places: ${stringValue}`))
    }

    const multiplier = 10n ** BigInt(scale)
    const unscaled = BigInt(whole) * multiplier + BigInt(fraction.padEnd(scale, '0') || '0')
    return ok(new Quantity(unscaled, scale, normalizedUnit))
  }

  get unit(): string {
    return this.#unit
  }

  get scale(): number {
    return this.#scale
  }

  get unscaled(): bigint {
    return this.#unscaled
  }

  isZero(): boolean {
    return this.#unscaled === 0n
  }

  isPositive(): boolean {
    return this.#unscaled > 0n
  }

  add(other: Quantity): Result<Quantity, QuantityUnitMismatchError> {
    const unitResult = this.ensureUnit(other)
    if (unitResult.isErr) {
      return err(unitResult.error)
    }

    const scale = Math.max(this.#scale, other.#scale)
    const left = Quantity.rescale(this.#unscaled, this.#scale, scale)
    const right = Quantity.rescale(other.#unscaled, other.#scale, scale)
    return ok(new Quantity(left + right, scale, this.#unit))
  }

  subtract(
    other: Quantity
  ): Result<Quantity, QuantityUnitMismatchError | InsufficientQuantityError> {
    const unitResult = this.ensureUnit(other)
    if (unitResult.isErr) {
      return err(unitResult.error)
    }

    const scale = Math.max(this.#scale, other.#scale)
    const left = Quantity.rescale(this.#unscaled, this.#scale, scale)
    const right = Quantity.rescale(other.#unscaled, other.#scale, scale)
    if (left < right) {
      return err(new InsufficientQuantityError(other.toString(), this.toString(), this.#unit))
    }

    return ok(new Quantity(left - right, scale, this.#unit))
  }

  multiply(factor: Decimal | bigint | number): Result<Quantity, InvalidQuantityError> {
    if (typeof factor === 'bigint') {
      if (factor < 0n) {
        return err(new InvalidQuantityError('Quantity factor cannot be negative'))
      }
      return ok(new Quantity(this.#unscaled * factor, this.#scale, this.#unit))
    }

    let decimalFactor: Decimal
    if (factor instanceof Decimal) {
      decimalFactor = factor
    } else {
      const parsed = Decimal.from(factor)
      if (parsed.isErr) {
        return err(new InvalidQuantityError(`Invalid multiplication factor: ${factor}`))
      }
      decimalFactor = parsed.value
    }

    if (decimalFactor.isNegative()) {
      return err(new InvalidQuantityError('Quantity factor cannot be negative'))
    }

    const productUnscaled = this.#unscaled * decimalFactor.unscaled
    const combinedScale = this.#scale + decimalFactor.scale
    const product = Decimal.fromParts(productUnscaled, combinedScale)
    if (product.isErr) {
      return err(new InvalidQuantityError(product.error.message))
    }

    const rounded = product.value.round(this.#scale, 'HALF_UP')
    if (rounded.isErr) {
      return err(new InvalidQuantityError(rounded.error.message))
    }

    return ok(new Quantity(rounded.value.unscaled, this.#scale, this.#unit))
  }

  compare(other: Quantity): Result<-1 | 0 | 1, QuantityUnitMismatchError> {
    const unitResult = this.ensureUnit(other)
    if (unitResult.isErr) {
      return err(unitResult.error)
    }

    const scale = Math.max(this.#scale, other.#scale)
    const left = Quantity.rescale(this.#unscaled, this.#scale, scale)
    const right = Quantity.rescale(other.#unscaled, other.#scale, scale)
    return ok(left === right ? 0 : left < right ? -1 : 1)
  }

  equals(other: Quantity): boolean {
    const comparison = this.compare(other)
    return comparison.isOk && comparison.value === 0
  }

  isGreaterThan(other: Quantity): Result<boolean, QuantityUnitMismatchError> {
    return this.compare(other).map((cmp) => cmp === 1)
  }

  isLessThan(other: Quantity): Result<boolean, QuantityUnitMismatchError> {
    return this.compare(other).map((cmp) => cmp === -1)
  }

  toString(): string {
    if (this.#scale === 0) {
      return this.#unscaled.toString()
    }

    const value = this.#unscaled.toString().padStart(this.#scale + 1, '0')
    const whole = value.slice(0, -this.#scale)
    const fraction = value.slice(-this.#scale).replace(/0+$/, '')
    return `${whole}${fraction.length > 0 ? `.${fraction}` : ''}`
  }

  toJSON(): { value: string; unit: string; scale: number } {
    return { value: this.toString(), unit: this.#unit, scale: this.#scale }
  }

  private ensureUnit(other: Quantity): Result<true, QuantityUnitMismatchError> {
    if (this.#unit !== other.#unit) {
      return err(new QuantityUnitMismatchError(this.#unit, other.#unit))
    }

    return ok(true)
  }

  private static rescale(value: bigint, fromScale: number, toScale: number): bigint {
    return value * 10n ** BigInt(toScale - fromScale)
  }
}
