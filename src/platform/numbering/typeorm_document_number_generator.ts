import { DateTime } from 'luxon'
import type { DataSource, EntityManager } from 'typeorm'
import { err, ok } from '../fp/index.js'
import type { Result } from '../fp/index.js'
import {
  DocumentNumberGenerator,
  InvalidNumberingConfigurationError,
  InvalidNumberingDateError,
  InvalidNumberingKeyError,
  NumberingPersistenceError,
  type NumberingOptions,
} from './document_number_generator.js'

export class TypeOrmDocumentNumberGenerator extends DocumentNumberGenerator {
  readonly #pattern: string
  readonly #prefix: string
  readonly #periodPartitioned: boolean

  constructor(
    private readonly dataSourceOrManager: DataSource | EntityManager,
    options: {
      pattern: string
      prefix: string
      periodPartitioned?: boolean
    }
  ) {
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
      | InvalidNumberingKeyError
      | InvalidNumberingConfigurationError
      | InvalidNumberingDateError
      | NumberingPersistenceError
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

    const dateResult = TypeOrmDocumentNumberGenerator.resolveDate(options?.date)
    if (dateResult.isErr) {
      return err(dateResult.error)
    }
    const date = dateResult.value
    const yyyy = date.toFormat('yyyy')
    const yy = date.toFormat('yy')
    const mm = date.toFormat('LL')
    const dd = date.toFormat('dd')
    const period = this.#periodPartitioned ? `${yyyy}${mm}` : ''

    const manager: EntityManager =
      options?.client && 'query' in options.client
        ? (options.client as EntityManager)
        : 'manager' in this.dataSourceOrManager
          ? this.dataSourceOrManager.manager
          : this.dataSourceOrManager

    let nextSeq: bigint
    try {
      const rows = await manager.query(
        `INSERT INTO document_sequences (sequence_key, period, current_seq, updated_at)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (sequence_key, period)
         DO UPDATE SET current_seq = document_sequences.current_seq + 1, updated_at = NOW()
         RETURNING current_seq`,
        [key, period]
      )
      nextSeq = BigInt(rows[0]?.current_seq ?? 1)
    } catch {
      return err(new NumberingPersistenceError(key))
    }

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
