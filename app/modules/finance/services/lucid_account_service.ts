import Account from '#modules/finance/models/account'
import { err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'
import {
  AccountAlreadyExistsError,
  AccountContract,
  AccountNotFoundError,
  InactiveAccountError,
  InvalidAccountError,
} from '#modules/finance/contracts/index'
import type { AccountSnapshot, CreateAccountInput } from '#modules/finance/contracts/index'
import type { TransactionOptions } from '#platform/persistence/index'

export class LucidAccountService extends AccountContract {
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
    const query = Account.query()
    if (options?.client) query.useTransaction(options.client)
    const duplicate = await query
      .where('id', id)
      .orWhere((builder) => {
        builder.where('company_id', companyId).where('code', code)
      })
      .first()
    if (duplicate) return err(new AccountAlreadyExistsError(duplicate.id === id ? id : code))
    try {
      const account = new Account()
      if (options?.client) account.useTransaction(options.client)
      account.fill({
        id,
        companyId,
        code,
        name,
        normalBalance: input.normalBalance,
        isActive: true,
      })
      await account.save()
      return ok(LucidAccountService.snapshot(account))
    } catch {
      return err(new AccountAlreadyExistsError(code))
    }
  }

  async find(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<AccountSnapshot, AccountNotFoundError>> {
    const query = Account.query()
    if (options?.client) query.useTransaction(options.client)
    const account = await query.where('id', id).first()
    return account ? ok(LucidAccountService.snapshot(account)) : err(new AccountNotFoundError(id))
  }

  async ensureActive(
    ids: readonly string[],
    options?: TransactionOptions
  ): Promise<Result<readonly AccountSnapshot[], AccountNotFoundError | InactiveAccountError>> {
    const query = Account.query()
    if (options?.client) query.useTransaction(options.client)
    const accounts = await query.whereIn('id', [...new Set(ids)])
    const byId = new Map(accounts.map((account) => [account.id, account]))
    for (const id of ids) {
      const account = byId.get(id)
      if (!account) return err(new AccountNotFoundError(id))
      if (!account.isActive) return err(new InactiveAccountError(id))
    }
    return ok(accounts.map(LucidAccountService.snapshot))
  }

  private static snapshot(account: Account): AccountSnapshot {
    return {
      id: account.id,
      companyId: account.companyId,
      code: account.code,
      name: account.name,
      normalBalance: account.normalBalance,
      isActive: account.isActive,
    }
  }
}
