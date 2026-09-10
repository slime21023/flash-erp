import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuditModule } from '@modules/audit/audit.module.js'
import {
  AccountContract,
  AccountingPeriodContract,
  CompanyAccountingSettingsContract,
  FinanceContract,
} from './contracts/index.js'
import { AccountEntity } from './entities/account.entity.js'
import { AccountingPeriodEntity } from './entities/accounting_period.entity.js'
import { CompanyAccountingSettingsEntity } from './entities/company_accounting_settings.entity.js'
import { JournalEntryEntity } from './entities/journal_entry.entity.js'
import { JournalEntryLineEntity } from './entities/journal_entry_line.entity.js'
import { TypeOrmAccountService } from './services/typeorm_account_service.js'
import { TypeOrmAccountingPeriodService } from './services/typeorm_accounting_period_service.js'
import { TypeOrmCompanyAccountingSettingsService } from './services/typeorm_company_accounting_settings_service.js'
import { TypeOrmFinanceService } from './services/typeorm_finance_service.js'
import { AccountsController } from './controllers/accounts.controller.js'
import { AccountingPeriodsController } from './controllers/accounting_periods.controller.js'
import { CompanyAccountingSettingsController } from './controllers/company_accounting_settings.controller.js'
import { JournalEntriesController } from './controllers/journal_entries.controller.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      AccountingPeriodEntity,
      CompanyAccountingSettingsEntity,
      JournalEntryEntity,
      JournalEntryLineEntity,
    ]),
    AuditModule,
  ],
  controllers: [
    AccountsController,
    AccountingPeriodsController,
    CompanyAccountingSettingsController,
    JournalEntriesController,
  ],
  providers: [
    {
      provide: AccountContract,
      useClass: TypeOrmAccountService,
    },
    {
      provide: AccountingPeriodContract,
      useClass: TypeOrmAccountingPeriodService,
    },
    {
      provide: CompanyAccountingSettingsContract,
      useClass: TypeOrmCompanyAccountingSettingsService,
    },
    {
      provide: FinanceContract,
      useClass: TypeOrmFinanceService,
    },
  ],
  exports: [
    AccountContract,
    AccountingPeriodContract,
    CompanyAccountingSettingsContract,
    FinanceContract,
  ],
})
export class FinanceModule {}
