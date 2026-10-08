import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { AccountingPeriodContract } from '../contracts/index.js'
import { financeApiContract } from '../contracts/finance_api_contract.js'

@Controller()
export class AccountingPeriodsController {
  constructor(private readonly period: AccountingPeriodContract) {}

  @RequirePermission('finance.period.create')
  @Implement(financeApiContract.accountingPeriods.store)
  store() {
    return implement(financeApiContract.accountingPeriods.store).handler(async ({ input }) =>
      unwrapResult(await this.period.create(input))
    )
  }

  @RequirePermission('finance.period.lock')
  @Implement(financeApiContract.accountingPeriods.lock)
  lock() {
    return implement(financeApiContract.accountingPeriods.lock).handler(async ({ input }) =>
      unwrapResult(await this.period.lock(input.id))
    )
  }
}
