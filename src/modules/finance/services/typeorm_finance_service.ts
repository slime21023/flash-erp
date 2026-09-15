import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, EntityManager } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import {
  type TransactionClient,
  type TransactionOptions,
  runInTransaction,
} from '@platform/persistence/index.js'
import { AuditContract } from '@modules/audit/contracts/index.js'
import { scopeMismatch } from '@platform/context/index.js'
import { ScopeForbiddenError } from '@platform/security/index.js'
import { CompanyAccountingSettingsContract } from '../contracts/index.js'
import {
  AccountingPeriodError,
  FinanceContract,
  InactiveAccountError,
  JournalEntry,
  JournalEntryAlreadyPostedError,
  JournalEntryNotFoundError,
  JournalEntryPersistenceError,
  FinanceQueryError,
  JournalEntryAlreadyReversedError,
} from '../contracts/index.js'
import type {
  CreateJournalEntryDraftInput,
  JournalEntryDraftSnapshot,
  LedgerLineSnapshot,
  TrialBalanceLine,
  ReverseJournalEntryInput,
  FinanceWriteContext,
} from '../contracts/finance_contract.js'
import { JournalEntryEntity } from '../entities/journal_entry.entity.js'
import { JournalEntryLineEntity } from '../entities/journal_entry_line.entity.js'
import { AccountingPeriodEntity } from '../entities/accounting_period.entity.js'
import { AccountEntity } from '../entities/account.entity.js'

@Injectable()
export class TypeOrmFinanceService extends FinanceContract {
  constructor(
    private readonly audit: AuditContract,
    private readonly settings: CompanyAccountingSettingsContract,
    @InjectRepository(JournalEntryEntity)
    private readonly entryRepo: Repository<JournalEntryEntity>
  ) {
    super()
  }

  async createDraft(
    input: CreateJournalEntryDraftInput,
    options?: TransactionOptions
  ): Promise<
    Result<JournalEntryDraftSnapshot, JournalEntryPersistenceError | ScopeForbiddenError>
  > {
    return runInTransaction<
      JournalEntryDraftSnapshot,
      JournalEntryPersistenceError | ScopeForbiddenError
    >(this.entryRepo.manager, options, (client) =>
      this.createDraftWithClient(input, client, options)
    )
  }

  private async createDraftWithClient(
    input: CreateJournalEntryDraftInput,
    manager: EntityManager,
    options?: TransactionOptions
  ): Promise<
    Result<JournalEntryDraftSnapshot, JournalEntryPersistenceError | ScopeForbiddenError>
  > {
    const entry = JournalEntry.create(input.id, input.lines)
    if (entry.isErr) {
      return err(new JournalEntryPersistenceError(entry.error.message))
    }

    const companyId = input.companyId.trim()
    const number = input.number.trim()
    if (!companyId || !number || !/^\d{4}-\d{2}-\d{2}$/.test(input.accountingDate)) {
      return err(
        new JournalEntryPersistenceError('companyId, number, and ISO accountingDate are required')
      )
    }

    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'journal entry'))

    const settings = await this.settings.ensureBaseCurrency(companyId, entry.value.currency, {
      client: manager,
      scope: options?.scope,
    })
    if (settings.isErr) {
      return err(new JournalEntryPersistenceError(settings.error.message))
    }

    try {
      const journalEntry = manager.create(JournalEntryEntity, {
        id: entry.value.id,
        companyId,
        number,
        accountingDate: input.accountingDate,
        status: 'DRAFT',
        currency: entry.value.currency,
        totalDebitMinorUnits: entry.value.totalDebit.minorUnits.toString(),
        totalCreditMinorUnits: entry.value.totalCredit.minorUnits.toString(),
        memo: input.memo?.trim() || null,
      })
      await manager.save(journalEntry)

      const lines = entry.value.lines.map((line, index) =>
        manager.create(JournalEntryLineEntity, {
          journalEntryId: entry.value.id,
          accountId: line.accountId,
          debitMinorUnits: line.debit.minorUnits.toString(),
          creditMinorUnits: line.credit.minorUnits.toString(),
          lineNumber: index + 1,
          memo: line.memo || null,
        })
      )
      await manager.save(lines)

      return ok(TypeOrmFinanceService.snapshot(journalEntry))
    } catch {
      return err(new JournalEntryPersistenceError(`Journal entry already exists: ${input.id}`))
    }
  }

  async postDraft(
    entryId: string,
    context?: FinanceWriteContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | AccountingPeriodError
      | InactiveAccountError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | AccountingPeriodError
      | InactiveAccountError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >(this.entryRepo.manager, options, (client) =>
      this.postWithClient(entryId, context, client, options)
    )
  }

  private async postWithClient(
    entryId: string,
    context: FinanceWriteContext | undefined,
    manager: EntityManager,
    options?: TransactionOptions
  ): Promise<
    Result<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | AccountingPeriodError
      | InactiveAccountError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >
  > {
    try {
      const entry = await manager
        .createQueryBuilder(JournalEntryEntity, 'e')
        .setLock('pessimistic_write')
        .where('e.id = :entryId', { entryId })
        .getOne()

      if (!entry) return err(new JournalEntryNotFoundError(entryId))
      const selectedScope = scopeMismatch(entry.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'journal entry'))
      if (entry.status !== 'DRAFT') return err(new JournalEntryAlreadyPostedError(entryId))

      const accountingDate =
        typeof entry.accountingDate === 'string'
          ? entry.accountingDate
          : (entry.accountingDate as any).toISOString().slice(0, 10)

      const periods = await manager
        .createQueryBuilder(AccountingPeriodEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.company_id = :companyId', { companyId: entry.companyId })
        .andWhere('p.status = :status', { status: 'OPEN' })
        .andWhere('p.starts_on <= :accountingDate', { accountingDate })
        .andWhere('p.ends_on >= :accountingDate', { accountingDate })
        .orderBy('p.starts_on', 'ASC')
        .getMany()

      if (periods.length !== 1)
        return err(new AccountingPeriodError(entry.companyId, accountingDate))

      const lines = await manager.find(JournalEntryLineEntity, {
        where: { journalEntryId: entryId },
      })
      const accountIds = lines.map((l) => l.accountId)
      const accounts = await manager
        .createQueryBuilder(AccountEntity, 'a')
        .where('a.id IN (:...accountIds)', { accountIds })
        .getMany()

      const byId = new Map(accounts.map((a) => [a.id, a]))
      for (const accountId of accountIds) {
        const acc = byId.get(accountId)
        if (!acc || acc.companyId !== entry.companyId || !acc.isActive) {
          return err(new InactiveAccountError(accountId))
        }
      }

      entry.status = 'POSTED'
      entry.postedAt = new Date()
      await manager.save(entry)

      const snapshot = TypeOrmFinanceService.snapshot(entry)
      const audit = await this.audit.append(
        {
          action: 'finance.journal_entry.posted',
          entityType: 'journal_entry',
          entityId: entryId,
          beforeValue: { status: 'DRAFT' },
          afterValue: { status: snapshot.status, number: snapshot.number },
          ...(context?.requestId ? { requestId: context.requestId } : {}),
        },
        { client: manager }
      )

      if (audit.isErr) return err(new JournalEntryPersistenceError(audit.error.message))

      return ok(snapshot)
    } catch {
      return err(new JournalEntryPersistenceError(`Unable to post journal entry: ${entryId}`))
    }
  }

  async ledger(
    companyId: string,
    from: string,
    to: string,
    options?: TransactionOptions
  ): Promise<Result<readonly LedgerLineSnapshot[], FinanceQueryError | ScopeForbiddenError>> {
    if (!companyId.trim() || !TypeOrmFinanceService.validDateRange(from, to)) {
      return err(new FinanceQueryError('companyId and an ordered ISO date range are required'))
    }

    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'general ledger'))

    const manager = options?.client ?? this.entryRepo.manager
    try {
      const rows = await manager
        .createQueryBuilder(JournalEntryLineEntity, 'line')
        .innerJoin(JournalEntryEntity, 'entry', 'entry.id = line.journal_entry_id')
        .innerJoin(AccountEntity, 'account', 'account.id = line.account_id')
        .where('entry.company_id = :companyId', { companyId })
        .andWhere('entry.status = :status', { status: 'POSTED' })
        .andWhere('entry.accounting_date >= :from', { from })
        .andWhere('entry.accounting_date <= :to', { to })
        .select([
          'entry.id as entry_id',
          'entry.number as entry_number',
          'entry.accounting_date as accounting_date',
          'entry.currency as currency',
          'line.account_id as account_id',
          'line.debit_minor_units as debit_minor_units',
          'line.credit_minor_units as credit_minor_units',
          'account.code as account_code',
          'account.name as account_name',
        ])
        .orderBy('entry.accounting_date', 'ASC')
        .addOrderBy('entry.number', 'ASC')
        .addOrderBy('line.line_number', 'ASC')
        .getRawMany()

      return ok(
        rows.map((row) => ({
          entryId: row.entry_id,
          entryNumber: row.entry_number,
          accountingDate:
            typeof row.accounting_date === 'string'
              ? row.accounting_date
              : (row.accounting_date as any).toISOString().slice(0, 10),
          accountId: row.account_id,
          accountCode: row.account_code,
          accountName: row.account_name,
          debitMinorUnits: BigInt(row.debit_minor_units),
          creditMinorUnits: BigInt(row.credit_minor_units),
          currency: row.currency,
        }))
      )
    } catch {
      return err(new FinanceQueryError('Unable to read general ledger'))
    }
  }

  async trialBalance(
    companyId: string,
    from: string,
    to: string,
    options?: TransactionOptions
  ): Promise<Result<readonly TrialBalanceLine[], FinanceQueryError | ScopeForbiddenError>> {
    if (!companyId.trim() || !TypeOrmFinanceService.validDateRange(from, to)) {
      return err(new FinanceQueryError('companyId and an ordered ISO date range are required'))
    }

    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'trial balance'))

    const manager = options?.client ?? this.entryRepo.manager
    try {
      const rows = await manager
        .createQueryBuilder(JournalEntryLineEntity, 'line')
        .innerJoin(JournalEntryEntity, 'entry', 'entry.id = line.journal_entry_id')
        .innerJoin(AccountEntity, 'account', 'account.id = line.account_id')
        .where('entry.company_id = :companyId', { companyId })
        .andWhere('entry.status = :status', { status: 'POSTED' })
        .andWhere('entry.accounting_date >= :from', { from })
        .andWhere('entry.accounting_date <= :to', { to })
        .groupBy('account.id')
        .addGroupBy('account.code')
        .addGroupBy('account.name')
        .select([
          'account.id as account_id',
          'account.code as account_code',
          'account.name as account_name',
          'SUM(line.debit_minor_units) as debit_minor_units',
          'SUM(line.credit_minor_units) as credit_minor_units',
        ])
        .orderBy('account.code', 'ASC')
        .getRawMany()

      return ok(
        rows.map((row) => ({
          accountId: row.account_id,
          accountCode: row.account_code,
          accountName: row.account_name,
          debitMinorUnits: BigInt(row.debit_minor_units ?? '0'),
          creditMinorUnits: BigInt(row.credit_minor_units ?? '0'),
        }))
      )
    } catch {
      return err(new FinanceQueryError('Unable to read trial balance'))
    }
  }

  async reverse(
    entryId: string,
    input: ReverseJournalEntryInput,
    context?: FinanceWriteContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | JournalEntryAlreadyReversedError
      | AccountingPeriodError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | JournalEntryAlreadyReversedError
      | AccountingPeriodError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >(this.entryRepo.manager, options, (client) =>
      this.reverseWithClient(entryId, input, context, client, options)
    )
  }

  private async reverseWithClient(
    entryId: string,
    input: ReverseJournalEntryInput,
    context: FinanceWriteContext | undefined,
    manager: EntityManager,
    options?: TransactionOptions
  ): Promise<
    Result<
      JournalEntryDraftSnapshot,
      | JournalEntryNotFoundError
      | JournalEntryAlreadyPostedError
      | JournalEntryAlreadyReversedError
      | AccountingPeriodError
      | JournalEntryPersistenceError
      | ScopeForbiddenError
    >
  > {
    if (
      !input.id.trim() ||
      !input.number.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.accountingDate)
    ) {
      return err(
        new JournalEntryPersistenceError('id, number, and ISO accountingDate are required')
      )
    }

    try {
      const source = await manager
        .createQueryBuilder(JournalEntryEntity, 'e')
        .setLock('pessimistic_write')
        .where('e.id = :entryId', { entryId })
        .getOne()

      if (!source) return err(new JournalEntryNotFoundError(entryId))
      const selectedScope = scopeMismatch(source.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'journal entry'))
      if (source.status !== 'POSTED') {
        return err(new JournalEntryPersistenceError('Only posted journal entries can be reversed'))
      }

      const existingReversal = await manager.findOne(JournalEntryEntity, {
        where: { reversalOfId: entryId },
      })
      if (existingReversal) return err(new JournalEntryAlreadyReversedError(entryId))

      const periods = await manager
        .createQueryBuilder(AccountingPeriodEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.company_id = :companyId', { companyId: source.companyId })
        .andWhere('p.status = :status', { status: 'OPEN' })
        .andWhere('p.starts_on <= :accountingDate', { accountingDate: input.accountingDate })
        .andWhere('p.ends_on >= :accountingDate', { accountingDate: input.accountingDate })
        .orderBy('p.starts_on', 'ASC')
        .getMany()

      if (periods.length !== 1) {
        return err(new AccountingPeriodError(source.companyId, input.accountingDate))
      }

      const sourceLines = await manager.find(JournalEntryLineEntity, {
        where: { journalEntryId: entryId },
        order: { lineNumber: 'ASC' },
      })

      const reversal = manager.create(JournalEntryEntity, {
        id: input.id.trim(),
        companyId: source.companyId,
        number: input.number.trim(),
        accountingDate: input.accountingDate,
        currency: source.currency,
        status: 'POSTED',
        totalDebitMinorUnits: source.totalDebitMinorUnits,
        totalCreditMinorUnits: source.totalCreditMinorUnits,
        postedAt: new Date(),
        memo: input.memo?.trim() || `Reversal of ${entryId}`,
        reversalOfId: entryId,
      })
      await manager.save(reversal)

      const reversedLines = sourceLines.map((line) =>
        manager.create(JournalEntryLineEntity, {
          journalEntryId: reversal.id,
          accountId: line.accountId,
          debitMinorUnits: line.creditMinorUnits,
          creditMinorUnits: line.debitMinorUnits,
          lineNumber: line.lineNumber,
          memo: line.memo,
        })
      )
      await manager.save(reversedLines)

      const snapshot = TypeOrmFinanceService.snapshot(reversal)
      const audit = await this.audit.append(
        {
          action: 'finance.journal_entry.reversed',
          entityType: 'journal_entry',
          entityId: entryId,
          beforeValue: { status: source.status },
          afterValue: { reversalEntryId: snapshot.id, status: snapshot.status },
          ...(context?.requestId ? { requestId: context.requestId } : {}),
        },
        { client: manager }
      )

      if (audit.isErr) return err(new JournalEntryPersistenceError(audit.error.message))

      return ok(snapshot)
    } catch {
      return err(new JournalEntryPersistenceError(`Unable to reverse journal entry: ${entryId}`))
    }
  }

  private static snapshot(entry: JournalEntryEntity): JournalEntryDraftSnapshot {
    return {
      id: entry.id,
      companyId: entry.companyId,
      number: entry.number,
      accountingDate:
        typeof entry.accountingDate === 'string'
          ? entry.accountingDate
          : (entry.accountingDate as any).toISOString().slice(0, 10),
      currency: entry.currency,
      status: entry.status,
      totalDebitMinorUnits: BigInt(entry.totalDebitMinorUnits),
      totalCreditMinorUnits: BigInt(entry.totalCreditMinorUnits),
      ...(entry.memo ? { memo: entry.memo } : {}),
    }
  }

  private static validDateRange(from: string, to: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to
  }
}
