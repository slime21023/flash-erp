import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import {
  AccountAlreadyExistsError,
  AccountContract,
  AccountNotFoundError,
  InactiveAccountError,
  InvalidAccountError,
} from '../contracts/index.js'
import type { AccountSnapshot, CreateAccountInput } from '../contracts/index.js'
import { AccountEntity } from '../entities/account.entity.js'

@Injectable()
export class TypeOrmAccountService extends AccountContract {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly repo: Repository<AccountEntity>
  ) {
    super()
  }

  async create(
    input: CreateAccountInput,
    options?: TransactionOptions
  ): Promise<Result<AccountSnapshot, InvalidAccountError | AccountAlreadyExistsError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !companyId || !code || !name) {
      return err(new InvalidAccountError('id, companyId, code, and name are required'))
    }

    const manager = options?.client ?? this.repo.manager

    const duplicate = await manager
      .createQueryBuilder(AccountEntity, 'a')
      .where('a.id = :id OR (a.company_id = :companyId AND a.code = :code)', {
        id,
        companyId,
        code,
      })
      .getOne()

    if (duplicate) {
      return err(new AccountAlreadyExistsError(duplicate.id === id ? id : code))
    }

    try {
      const entity = manager.create(AccountEntity, {
        id,
        companyId,
        code,
        name,
        normalBalance: input.normalBalance,
        isActive: true,
      })
      await manager.save(entity)
      return ok(TypeOrmAccountService.snapshot(entity))
    } catch {
      return err(new AccountAlreadyExistsError(code))
    }
  }

  async find(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<AccountSnapshot, AccountNotFoundError>> {
    const manager = options?.client ?? this.repo.manager
    const account = await manager.findOne(AccountEntity, { where: { id } })
    return account ? ok(TypeOrmAccountService.snapshot(account)) : err(new AccountNotFoundError(id))
  }

  async ensureActive(
    ids: readonly string[],
    options?: TransactionOptions
  ): Promise<Result<readonly AccountSnapshot[], AccountNotFoundError | InactiveAccountError>> {
    const manager = options?.client ?? this.repo.manager
    const uniqueIds = [...new Set(ids)]
    const accounts = await manager
      .createQueryBuilder(AccountEntity, 'a')
      .where('a.id IN (:...uniqueIds)', { uniqueIds })
      .getMany()

    const byId = new Map(accounts.map((acc) => [acc.id, acc]))
    for (const id of ids) {
      const acc = byId.get(id)
      if (!acc) return err(new AccountNotFoundError(id))
      if (!acc.isActive) return err(new InactiveAccountError(id))
    }

    return ok(accounts.map(TypeOrmAccountService.snapshot))
  }

  private static snapshot(account: AccountEntity): AccountSnapshot {
    return {
      id: account.id,
      companyId: account.companyId,
      code: account.code,
      name: account.name,
      normalBalance: account.normalBalance,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }
  }
}
