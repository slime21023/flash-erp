import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { AccountContract } from '../contracts/index.js'
import { financeApiContract } from '../contracts/finance_api_contract.js'

@Controller()
export class AccountsController {
  constructor(private readonly account: AccountContract) {}

  @RequirePermission('finance.account.create')
  @Implement(financeApiContract.accounts.store)
  store() {
    return implement(financeApiContract.accounts.store).handler(async ({ input }) =>
      unwrapResult(await this.account.create(input))
    )
  }

  @RequirePermission('finance.account.read')
  @Implement(financeApiContract.accounts.show)
  show() {
    return implement(financeApiContract.accounts.show).handler(async ({ input }) =>
      unwrapResult(await this.account.find(input.id))
    )
  }
}
