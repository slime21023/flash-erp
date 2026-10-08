import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '../http/result_adapter.js'
import { systemApiContract } from '../http/system_api_contract.js'
import { Public } from '@platform/security/index.js'
import { AddonRegistry } from './registry.js'

@Controller()
export class AddonsController {
  constructor(private readonly registry: AddonRegistry) {}

  @Public()
  @Implement(systemApiContract.getModules)
  getModules() {
    return implement(systemApiContract.getModules).handler(() =>
      unwrapResult(
        this.registry.resolveDependencies().map((ordered) => ({
          total: ordered.length,
          modules: ordered,
          all: this.registry.getAllManifests(),
        }))
      )
    )
  }
}
