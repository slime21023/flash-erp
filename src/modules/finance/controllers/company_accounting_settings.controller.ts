import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { CompanyAccountingSettingsContract } from '../contracts/index.js'
import { financeApiContract } from '../contracts/finance_api_contract.js'

@Controller()
export class CompanyAccountingSettingsController {
  constructor(private readonly settings: CompanyAccountingSettingsContract) {}

  @RequirePermission('finance.settings.configure')
  @Implement(financeApiContract.companyAccountingSettings.store)
  store() {
    return implement(financeApiContract.companyAccountingSettings.store).handler(
      async ({ input }) => unwrapResult(await this.settings.configure(input))
    )
  }
}
