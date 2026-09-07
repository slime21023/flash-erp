import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { AccountContract } from '#modules/finance/contracts/index'
import type { CreateAccountInput } from '#modules/finance/contracts/index'
import { ResultPresenter } from '#platform/http/index'
import { createAccountValidator } from '#modules/finance/validators/create_account'

@inject()
export default class AccountsController {
  constructor(private accounts: AccountContract) {}

  async store({ request, response }: HttpContext) {
    const input = (await request.validateUsing(createAccountValidator)) as CreateAccountInput
    return ResultPresenter.handle({ response }, await this.accounts.create(input), {
      successStatus: 201,
    })
  }

  async show({ params, response }: HttpContext) {
    return ResultPresenter.handle({ response }, await this.accounts.find(params.id))
  }
}
