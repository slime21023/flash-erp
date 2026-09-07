import type { ApplicationService } from '@adonisjs/core/types'
import { OrganizationContract } from '#modules/organization/contracts/index'
import { LucidOrganizationService } from '#modules/organization/services/lucid_organization_service'

export default class OrganizationProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(OrganizationContract, () => new LucidOrganizationService())
  }
}
