import { DateTime } from 'luxon'
import { DomainError, err, ok } from '../fp/index.js'
import type { Result } from '../fp/index.js'
import type { TransactionOptions } from '../persistence/index.js'

export class InvalidNumberingKeyError extends DomainError {
  readonly code = 'INVALID_NUMBERING_KEY'

  constructor(message: string) {
    super(message)
  }
}

export class InvalidNumberingConfigurationError extends DomainError {
  readonly code = 'INVALID_NUMBERING_CONFIGURATION'

  constructor(message: string) {
    super(message)
  }
}

export class InvalidNumberingDateError extends DomainError {
  readonly code = 'INVALID_NUMBERING_DATE'

  constructor(readonly input: string) {
    super(`Invalid numbering date: ${input}`)
  }
}

export class NumberingPersistenceError extends DomainError {
  readonly code = 'NUMBERING_PERSISTENCE_ERROR'

  constructor(readonly sequenceKey: string) {
    super(`Unable to allocate the next document number for sequence: ${sequenceKey}`)
  }
}

export type NumberingOptions = TransactionOptions & {
  date?: Date | DateTime | string
  variables?: Record<string, string>
}

export abstract class DocumentNumberGenerator {
  abstract next(
    sequenceKey: string,
    options?: NumberingOptions
  ): Promise<
    Result<
      string,
      | InvalidNumberingKeyError
      | InvalidNumberingConfigurationError
      | InvalidNumberingDateError
      | NumberingPersistenceError
    >
  >
}

export class InMemoryDocumentNumberGenerator extends DocumentNumberGenerator {
  readonly #prefix: string
  readonly #padding: number
  readonly #sequences = new Map<string, bigint>()

  constructor(prefix: string, padding = 6) {
    super()
    this.#prefix = prefix.trim().toUpperCase()
    this.#padding = padding
  }

  async next(
    sequenceKey: string,
    _options?: NumberingOptions
  ): Promise<
    Result<
      string,
      InvalidNumberingKeyError | InvalidNumberingConfigurationError | InvalidNumberingDateError
    >
  > {
    if (sequenceKey.trim().length === 0) {
      return err(new InvalidNumberingKeyError('Sequence key cannot be empty'))
    }

    if (this.#prefix.length === 0 || !Number.isInteger(this.#padding) || this.#padding < 1) {
      return err(new InvalidNumberingConfigurationError('Prefix and padding must be configured'))
    }

    const current = this.#sequences.get(sequenceKey) ?? 0n
    const next = current + 1n
    this.#sequences.set(sequenceKey, next)
    return ok(`${this.#prefix}-${next.toString().padStart(this.#padding, '0')}`)
  }
}

export class PatternDocumentNumberGenerator extends DocumentNumberGenerator {
  readonly #pattern: string
  readonly #prefix: string
  readonly #periodPartitioned: boolean
  readonly #sequences = new Map<string, bigint>()

  constructor(options: {
    pattern: string // e.g. "{PREFIX}-{YYYY}{MM}-{SEQ:6}"
    prefix: string
    periodPartitioned?: boolean
  }) {
    super()
    this.#pattern = options.pattern
    this.#prefix = options.prefix.trim().toUpperCase()
    this.#periodPartitioned = options.periodPartitioned ?? true
  }

  async next(
    sequenceKey: string,
    options?: NumberingOptions
  ): Promise<
    Result<
      string,
      InvalidNumberingKeyError | InvalidNumberingConfigurationError | InvalidNumberingDateError
    >
  > {
    const key = sequenceKey.trim()
    if (key.length === 0) {
      return err(new InvalidNumberingKeyError('Sequence key cannot be empty'))
    }

    if (!this.#pattern.includes('{SEQ:') && !this.#pattern.includes('{SEQ}')) {
      return err(
        new InvalidNumberingConfigurationError(
          `Numbering pattern must include a {SEQ} or {SEQ:N} placeholder: ${this.#pattern}`
        )
      )
    }

    if (this.#prefix.length === 0) {
      return err(new InvalidNumberingConfigurationError('Numbering prefix cannot be empty'))
    }

    const dateResult = PatternDocumentNumberGenerator.resolveDate(options?.date)
    if (dateResult.isErr) {
      return err(dateResult.error)
    }
    const date = dateResult.value
    const yyyy = date.toFormat('yyyy')
    const yy = date.toFormat('yy')
    const mm = date.toFormat('LL')
    const dd = date.toFormat('dd')
    const period = `${yyyy}${mm}`

    const partitionKey = this.#periodPartitioned ? `${key}:${period}` : key
    const current = this.#sequences.get(partitionKey) ?? 0n
    const nextSeq = current + 1n
    this.#sequences.set(partitionKey, nextSeq)

    const seqMatch = /{SEQ(?::(\d+))?}/.exec(this.#pattern)
    const padding = seqMatch?.[1] ? Number.parseInt(seqMatch[1], 10) : 6
    if (!Number.isSafeInteger(padding) || padding < 1 || padding > 32) {
      return err(
        new InvalidNumberingConfigurationError('Sequence padding must be between 1 and 32')
      )
    }
    const formattedSeq = nextSeq.toString().padStart(padding, '0')

    let result = this.#pattern
      .replace('{PREFIX}', this.#prefix)
      .replace('{YYYY}', yyyy)
      .replace('{YY}', yy)
      .replace('{MM}', mm)
      .replace('{DD}', dd)
      .replace(/{SEQ(?::\d+)?}/, formattedSeq)

    if (options?.variables) {
      for (const [varKey, varVal] of Object.entries(options.variables)) {
        result = result.replaceAll(`{${varKey}}`, varVal)
      }
    }

    return ok(result)
  }

  private static resolveDate(
    input?: Date | DateTime | string
  ): Result<DateTime, InvalidNumberingDateError> {
    if (!input) {
      return ok(DateTime.utc())
    }
    if (input instanceof DateTime) {
      return input.isValid
        ? ok(input.toUTC())
        : err(new InvalidNumberingDateError(input.invalidReason ?? 'Invalid DateTime'))
    }
    if (input instanceof Date) {
      const parsed = DateTime.fromJSDate(input, { zone: 'utc' })
      return parsed.isValid ? ok(parsed) : err(new InvalidNumberingDateError(input.toString()))
    }
    const parsed = DateTime.fromISO(input, { zone: 'utc' })
    return parsed.isValid ? ok(parsed) : err(new InvalidNumberingDateError(input))
  }
}
