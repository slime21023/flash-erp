import type { ApplicationService } from '@adonisjs/core/types'
import { AccountContract } from '#modules/finance/contracts/index'
import { LucidAccountService } from '#modules/finance/services/lucid_account_service'

export default class FinanceProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(AccountContract, () => new LucidAccountService())
  }
}
