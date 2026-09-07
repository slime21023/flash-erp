import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ResultPresenter } from '#platform/http/index'
import { OrganizationContract } from '#modules/organization/contracts/index'
import type { RegisterOrganizationUnitInput } from '#modules/organization/contracts/index'
import { registerOrganizationUnitValidator } from '#modules/organization/validators/register_organization_unit'

@inject()
export default class OrganizationUnitsController {
  constructor(private organization: OrganizationContract) {}

  async store({ request, response }: HttpContext) {
    const input = (await request.validateUsing(
      registerOrganizationUnitValidator
    )) as RegisterOrganizationUnitInput
    const result = await this.organization.registerUnit(input)
    return ResultPresenter.handle({ response }, result, { successStatus: 201 })
  }

  async show({ params, response }: HttpContext) {
    const result = await this.organization.findUnit(params.id)
    return ResultPresenter.handle({ response }, result)
  }
}
