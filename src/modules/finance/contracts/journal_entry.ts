import { DomainError, err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import { Money } from '@platform/kernel/index.js'

export type JournalLine = Readonly<{
  accountId: string
  debit: Money
  credit: Money
  memo?: string
}>

export class InvalidJournalEntryError extends DomainError {
  readonly code = 'INVALID_JOURNAL_ENTRY'

  constructor(message: string) {
    super(message)
  }
}

export class UnbalancedJournalEntryError extends DomainError {
  readonly code = 'UNBALANCED_JOURNAL_ENTRY'

  constructor(
    readonly debitMinorUnits: bigint,
    readonly creditMinorUnits: bigint,
    readonly currency: string
  ) {
    super(
      `Journal entry is unbalanced: debit ${debitMinorUnits}, credit ${creditMinorUnits} ${currency}`
    )
  }
}

export class JournalEntry {
  readonly #id: string
  readonly #currency: string
  readonly #lines: readonly JournalLine[]
  readonly #totalDebit: Money
  readonly #totalCredit: Money

  private constructor(
    id: string,
    currency: string,
    lines: readonly JournalLine[],
    totalDebit: Money,
    totalCredit: Money
  ) {
    this.#id = id
    this.#currency = currency
    this.#lines = Object.freeze(
      lines.map((line) =>
        Object.freeze({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          ...(line.memo === undefined ? {} : { memo: line.memo }),
        })
      )
    )
    this.#totalDebit = totalDebit
    this.#totalCredit = totalCredit
    Object.freeze(this)
  }

  static create(
    id: string,
    lines: readonly JournalLine[]
  ): Result<JournalEntry, InvalidJournalEntryError | UnbalancedJournalEntryError> {
    const normalizedId = id.trim()
    if (normalizedId.length === 0) {
      return err(new InvalidJournalEntryError('Journal entry id is required'))
    }

    if (lines.length < 2) {
      return err(new InvalidJournalEntryError('A journal entry requires at least two lines'))
    }

    const firstLine = lines[0]
    if (!firstLine) {
      return err(new InvalidJournalEntryError('A journal entry requires at least two lines'))
    }

    const currency = firstLine.debit.currency
    let debitMinorUnits = 0n
    let creditMinorUnits = 0n

    for (const line of lines) {
      if (line.accountId.trim().length === 0) {
        return err(new InvalidJournalEntryError('Every journal line requires an account id'))
      }

      if (
        line.debit.currency !== currency ||
        line.credit.currency !== currency ||
        line.debit.minorUnits < 0n ||
        line.credit.minorUnits < 0n
      ) {
        return err(
          new InvalidJournalEntryError('Every journal line must use one non-negative currency')
        )
      }

      const hasDebit = line.debit.minorUnits > 0n
      const hasCredit = line.credit.minorUnits > 0n
      if (hasDebit === hasCredit) {
        return err(
          new InvalidJournalEntryError('A line must contain exactly one debit or credit amount')
        )
      }

      debitMinorUnits += line.debit.minorUnits
      creditMinorUnits += line.credit.minorUnits
    }

    if (debitMinorUnits !== creditMinorUnits) {
      return err(new UnbalancedJournalEntryError(debitMinorUnits, creditMinorUnits, currency))
    }

    const totalDebit = Money.fromMinorUnits(debitMinorUnits, currency)
    const totalCredit = Money.fromMinorUnits(creditMinorUnits, currency)
    if (totalDebit.isErr || totalCredit.isErr) {
      return err(
        new InvalidJournalEntryError('Journal entry totals could not be represented as money')
      )
    }

    return ok(new JournalEntry(normalizedId, currency, lines, totalDebit.value, totalCredit.value))
  }

  get id(): string {
    return this.#id
  }

  get currency(): string {
    return this.#currency
  }

  get lines(): readonly JournalLine[] {
    return Object.freeze([...this.#lines])
  }

  get totalDebit(): Money {
    return this.#totalDebit
  }

  get totalCredit(): Money {
    return this.#totalCredit
  }

  toJSON() {
    return {
      id: this.#id,
      currency: this.#currency,
      totalDebit: this.#totalDebit.toJSON(),
      totalCredit: this.#totalCredit.toJSON(),
      lines: this.#lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit.toJSON(),
        credit: line.credit.toJSON(),
        ...(line.memo ? { memo: line.memo } : {}),
      })),
    }
  }
}
