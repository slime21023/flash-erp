import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type { AccountingPeriodError } from './finance_errors.js'

export type AccountingPeriodSnapshot = Readonly<{
  id: string
  companyId: string
  code: string
  startsOn: string
  endsOn: string
  status: 'OPEN' | 'LOCKED' | 'CLOSED'
}>

export type CreateAccountingPeriodInput = Readonly<{
  id: string
  companyId: string
  code: string
  startsOn: string
  endsOn: string
}>

export abstract class AccountingPeriodContract {
  abstract create(
    input: CreateAccountingPeriodInput,
    options?: TransactionOptions
  ): Promise<Result<AccountingPeriodSnapshot, AccountingPeriodError>>
  abstract ensureOpen(
    companyId: string,
    accountingDate: string,
    options?: TransactionOptions
  ): Promise<Result<AccountingPeriodSnapshot, AccountingPeriodError>>
  abstract lock(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<AccountingPeriodSnapshot, AccountingPeriodError>>
}
