import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import {
  CompanyAccountingSettingsContract,
  CompanyAccountingSettingsError,
} from '../contracts/index.js'
import type { CompanyAccountingSettings } from '../contracts/index.js'
import { CompanyAccountingSettingsEntity } from '../entities/company_accounting_settings.entity.js'

@Injectable()
export class TypeOrmCompanyAccountingSettingsService extends CompanyAccountingSettingsContract {
  constructor(
    @InjectRepository(CompanyAccountingSettingsEntity)
    private readonly repo: Repository<CompanyAccountingSettingsEntity>
  ) {
    super()
  }

  async configure(
    settings: CompanyAccountingSettings,
    options?: TransactionOptions
  ): Promise<Result<CompanyAccountingSettings, CompanyAccountingSettingsError>> {
    const companyId = settings.companyId.trim()
    const baseCurrency = settings.baseCurrency.trim().toUpperCase()

    if (!companyId || !/^[A-Z]{3}$/.test(baseCurrency)) {
      return err(
        new CompanyAccountingSettingsError(companyId, 'A three-letter base currency is required')
      )
    }

    const manager = options?.client ?? this.repo.manager
    try {
      let entity = await manager.findOne(CompanyAccountingSettingsEntity, { where: { companyId } })
      if (entity) {
        entity.baseCurrency = baseCurrency
      } else {
        entity = manager.create(CompanyAccountingSettingsEntity, { companyId, baseCurrency })
      }
      await manager.save(entity)
      return ok({ companyId, baseCurrency })
    } catch {
      return err(
        new CompanyAccountingSettingsError(companyId, 'Unable to configure company settings')
      )
    }
  }

  async ensureBaseCurrency(
    companyId: string,
    currency: string,
    options?: TransactionOptions
  ): Promise<Result<CompanyAccountingSettings, CompanyAccountingSettingsError>> {
    const manager = options?.client ?? this.repo.manager
    const row = await manager.findOne(CompanyAccountingSettingsEntity, { where: { companyId } })

    if (!row || row.baseCurrency !== currency) {
      return err(
        new CompanyAccountingSettingsError(companyId, 'Company base currency does not match')
      )
    }

    return ok({ companyId, baseCurrency: row.baseCurrency })
  }
}
