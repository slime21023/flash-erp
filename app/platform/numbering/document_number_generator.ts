import { DateTime } from 'luxon'
import { DomainError, err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'
import type { TransactionOptions } from '#platform/persistence/index'

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

export type NumberingOptions = TransactionOptions & {
  date?: Date | DateTime | string
  variables?: Record<string, string>
}

export abstract class DocumentNumberGenerator {
  abstract next(
    sequenceKey: string,
    options?: NumberingOptions
  ): Promise<Result<string, InvalidNumberingKeyError | InvalidNumberingConfigurationError>>
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
  ): Promise<Result<string, InvalidNumberingKeyError | InvalidNumberingConfigurationError>> {
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
  ): Promise<Result<string, InvalidNumberingKeyError | InvalidNumberingConfigurationError>> {
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

    const date = PatternDocumentNumberGenerator.resolveDate(options?.date)
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

  private static resolveDate(input?: Date | DateTime | string): DateTime {
    if (!input) {
      return DateTime.utc()
    }
    if (input instanceof DateTime) {
      return input.toUTC()
    }
    if (input instanceof Date) {
      return DateTime.fromJSDate(input, { zone: 'utc' })
    }
    const parsed = DateTime.fromISO(input, { zone: 'utc' })
    return parsed.isValid ? parsed : DateTime.utc()
  }
}
