import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { AccountingPeriodContract, AccountingPeriodError } from '../contracts/index.js'
import type { AccountingPeriodSnapshot, CreateAccountingPeriodInput } from '../contracts/index.js'
import { AccountingPeriodEntity } from '../entities/accounting_period.entity.js'

@Injectable()
export class TypeOrmAccountingPeriodService extends AccountingPeriodContract {
  constructor(
    @InjectRepository(AccountingPeriodEntity)
    private readonly repo: Repository<AccountingPeriodEntity>
  ) {
    super()
  }

  async create(
    input: CreateAccountingPeriodInput,
    options?: TransactionOptions
  ): Promise<Result<AccountingPeriodSnapshot, AccountingPeriodError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()

    if (!id || !companyId || !code || input.startsOn > input.endsOn) {
      return err(new AccountingPeriodError(companyId, input.startsOn))
    }

    const manager = options?.client ?? this.repo.manager
    try {
      const entity = manager.create(AccountingPeriodEntity, {
        id,
        companyId,
        code,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: 'OPEN',
      })
      await manager.save(entity)
      return ok(TypeOrmAccountingPeriodService.snapshot(entity))
    } catch {
      return err(new AccountingPeriodError(companyId, input.startsOn))
    }
  }

  async ensureOpen(
    companyId: string,
    accountingDate: string,
    options?: TransactionOptions
  ): Promise<Result<AccountingPeriodSnapshot, AccountingPeriodError>> {
    const manager = options?.client ?? this.repo.manager
    const row = await manager
      .createQueryBuilder(AccountingPeriodEntity, 'p')
      .where('p.company_id = :companyId', { companyId })
      .andWhere('p.status = :status', { status: 'OPEN' })
      .andWhere('p.starts_on <= :accountingDate', { accountingDate })
      .andWhere('p.ends_on >= :accountingDate', { accountingDate })
      .getOne()

    return row
      ? ok(TypeOrmAccountingPeriodService.snapshot(row))
      : err(new AccountingPeriodError(companyId, accountingDate))
  }

  async lock(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<AccountingPeriodSnapshot, AccountingPeriodError>> {
    const manager = options?.client ?? this.repo.manager
    try {
      const row = await manager.findOne(AccountingPeriodEntity, { where: { id, status: 'OPEN' } })
      if (!row) {
        return err(new AccountingPeriodError(id, 'lock'))
      }

      row.status = 'LOCKED'
      await manager.save(row)
      return ok(TypeOrmAccountingPeriodService.snapshot(row))
    } catch {
      return err(new AccountingPeriodError(id, 'lock'))
    }
  }

  private static snapshot(period: AccountingPeriodEntity): AccountingPeriodSnapshot {
    return {
      id: period.id,
      companyId: period.companyId,
      code: period.code,
      startsOn:
        typeof period.startsOn === 'string'
          ? period.startsOn
          : (period.startsOn as any)?.toISOString().slice(0, 10),
      endsOn:
        typeof period.endsOn === 'string'
          ? period.endsOn
          : (period.endsOn as any)?.toISOString().slice(0, 10),
      status: period.status,
    }
  }
}
