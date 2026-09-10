import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type { CompanyAccountingSettingsError } from './finance_errors.js'

export type CompanyAccountingSettings = Readonly<{
  companyId: string
  baseCurrency: string
}>

export abstract class CompanyAccountingSettingsContract {
  abstract configure(
    settings: CompanyAccountingSettings,
    options?: TransactionOptions
  ): Promise<Result<CompanyAccountingSettings, CompanyAccountingSettingsError>>
  abstract ensureBaseCurrency(
    companyId: string,
    currency: string,
    options?: TransactionOptions
  ): Promise<Result<CompanyAccountingSettings, CompanyAccountingSettingsError>>
}
