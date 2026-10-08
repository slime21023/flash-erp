import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { OrganizationContract } from '../contracts/index.js'
import { organizationApiContract } from '../contracts/organization_api_contract.js'

@Controller()
export class OrganizationUnitsController {
  constructor(private readonly organization: OrganizationContract) {}

  @RequirePermission('organization.unit.create')
  @Implement(organizationApiContract.units.register)
  register() {
    return implement(organizationApiContract.units.register).handler(async ({ input }) =>
      unwrapResult(await this.organization.registerUnit(input))
    )
  }

  @RequirePermission('organization.unit.read')
  @Implement(organizationApiContract.units.find)
  find() {
    return implement(organizationApiContract.units.find).handler(async ({ input }) =>
      unwrapResult(await this.organization.findUnit(input.id))
    )
  }
}
