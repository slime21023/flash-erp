import { DateTime } from 'luxon'
import { DomainError, err, ok } from '../fp/index.js'
import type { Result } from '../fp/index.js'

export class InvalidDateRangeError extends DomainError {
  readonly code = 'INVALID_DATE_RANGE'

  constructor(message: string) {
    super(message)
  }
}

export class DateRange {
  readonly #start: DateTime
  readonly #end: DateTime

  private constructor(start: DateTime, end: DateTime) {
    this.#start = start
    this.#end = end
    Object.freeze(this)
  }

  static from(
    start: DateTime | Date | string,
    end: DateTime | Date | string
  ): Result<DateRange, InvalidDateRangeError> {
    const startDateTime = DateRange.parseDateTime(start)
    if (!startDateTime.isValid) {
      return err(
        new InvalidDateRangeError(
          `Invalid start date: ${String(start)} (${startDateTime.invalidExplanation ?? 'unparseable'})`
        )
      )
    }

    const endDateTime = DateRange.parseDateTime(end)
    if (!endDateTime.isValid) {
      return err(
        new InvalidDateRangeError(
          `Invalid end date: ${String(end)} (${endDateTime.invalidExplanation ?? 'unparseable'})`
        )
      )
    }

    if (startDateTime > endDateTime) {
      return err(
        new InvalidDateRangeError(
          `Start date (${startDateTime.toISO()}) must be before or equal to end date (${endDateTime.toISO()})`
        )
      )
    }

    return ok(new DateRange(startDateTime, endDateTime))
  }

  static forDay(date: DateTime | Date | string): Result<DateRange, InvalidDateRangeError> {
    const parsed = DateRange.parseDateTime(date)
    if (!parsed.isValid) {
      return err(new InvalidDateRangeError(`Invalid date for day range: ${String(date)}`))
    }

    const start = parsed.startOf('day')
    const end = parsed.endOf('day')
    return ok(new DateRange(start, end))
  }

  static forMonth(year: number, month: number): Result<DateRange, InvalidDateRangeError> {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return err(new InvalidDateRangeError(`Invalid year/month: ${year}-${month}`))
    }

    const base = DateTime.utc(year, month, 1)
    if (!base.isValid) {
      return err(new InvalidDateRangeError(`Invalid month specification: ${year}-${month}`))
    }

    return ok(new DateRange(base.startOf('month'), base.endOf('month')))
  }

  static forYear(year: number): Result<DateRange, InvalidDateRangeError> {
    if (!Number.isInteger(year) || year < 1 || year > 9999) {
      return err(new InvalidDateRangeError(`Invalid year: ${year}`))
    }

    const base = DateTime.utc(year, 1, 1)
    return ok(new DateRange(base.startOf('year'), base.endOf('year')))
  }

  get start(): DateTime {
    return this.#start
  }

  get end(): DateTime {
    return this.#end
  }

  contains(target: DateTime | Date | string): boolean {
    const parsed = DateRange.parseDateTime(target)
    if (!parsed.isValid) return false
    return this.#start <= parsed && parsed <= this.#end
  }

  containsRange(other: DateRange): boolean {
    return this.#start <= other.#start && other.#end <= this.#end
  }

  overlaps(other: DateRange): boolean {
    return this.#start <= other.#end && other.#start <= this.#end
  }

  intersection(other: DateRange): DateRange | null {
    if (!this.overlaps(other)) {
      return null
    }

    const maxStart = this.#start > other.#start ? this.#start : other.#start
    const minEnd = this.#end < other.#end ? this.#end : other.#end
    return new DateRange(maxStart, minEnd)
  }

  durationInMilliseconds(): number {
    return this.#end.diff(this.#start).milliseconds
  }

  durationInHours(): number {
    return this.#end.diff(this.#start, 'hours').hours
  }

  durationInDays(): number {
    return this.#end.diff(this.#start, 'days').days
  }

  isPast(referenceDate?: DateTime): boolean {
    const now = referenceDate ?? DateTime.utc()
    return this.#end < now
  }

  isFuture(referenceDate?: DateTime): boolean {
    const now = referenceDate ?? DateTime.utc()
    return this.#start > now
  }

  isCurrent(referenceDate?: DateTime): boolean {
    const now = referenceDate ?? DateTime.utc()
    return this.contains(now)
  }

  equals(other: DateRange): boolean {
    return (
      this.#start.toMillis() === other.#start.toMillis() &&
      this.#end.toMillis() === other.#end.toMillis()
    )
  }

  toString(): string {
    return `[${this.#start.toISO()}..${this.#end.toISO()}]`
  }

  toJSON(): { start: string; end: string } {
    return {
      start: this.#start.toISO() ?? '',
      end: this.#end.toISO() ?? '',
    }
  }

  private static parseDateTime(input: DateTime | Date | string): DateTime {
    if (input instanceof DateTime) {
      return input
    }

    if (input instanceof Date) {
      return DateTime.fromJSDate(input, { zone: 'utc' })
    }

    if (typeof input === 'string') {
      const iso = DateTime.fromISO(input, { zone: 'utc' })
      if (iso.isValid) return iso
      const sql = DateTime.fromSQL(input, { zone: 'utc' })
      if (sql.isValid) return sql
      return DateTime.fromRFC2822(input, { zone: 'utc' })
    }

    return DateTime.invalid('unsupported date format')
  }
}
