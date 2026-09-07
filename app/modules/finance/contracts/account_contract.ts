import type { Result } from '#platform/fp/index'
import type { TransactionOptions } from '#platform/persistence/index'
import type {
  AccountAlreadyExistsError,
  AccountNotFoundError,
  InactiveAccountError,
  InvalidAccountError,
} from './finance_errors.js'

export type NormalBalance = 'DEBIT' | 'CREDIT'

export type AccountSnapshot = Readonly<{
  id: string
  companyId: string
  code: string
  name: string
  normalBalance: NormalBalance
  isActive: boolean
}>

export type CreateAccountInput = Readonly<{
  id: string
  companyId: string
  code: string
  name: string
  normalBalance: NormalBalance
}>

export abstract class AccountContract {
  abstract create(
    input: CreateAccountInput,
    options?: TransactionOptions
  ): Promise<Result<AccountSnapshot, InvalidAccountError | AccountAlreadyExistsError>>
  abstract find(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<AccountSnapshot, AccountNotFoundError>>
  abstract ensureActive(
    ids: readonly string[],
    options?: TransactionOptions
  ): Promise<Result<readonly AccountSnapshot[], AccountNotFoundError | InactiveAccountError>>
}
