import OrganizationUnit from '#modules/organization/models/organization_unit'
import {
  OrganizationContract,
  OrganizationUnitNotFoundError,
} from '#modules/organization/contracts/index'
import type { OrganizationUnitSnapshot } from '#modules/organization/contracts/index'
import type { TransactionOptions } from '#platform/persistence/index'
import { err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'

export class LucidOrganizationService extends OrganizationContract {
  async findUnit(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, OrganizationUnitNotFoundError>> {
    const query = OrganizationUnit.query()
    if (options?.client) {
      query.useTransaction(options.client)
    }

    const unit = await query.where('id', id).first()
    return unit
      ? ok(LucidOrganizationService.toSnapshot(unit))
      : err(new OrganizationUnitNotFoundError(id))
  }

  private static toSnapshot(unit: OrganizationUnit): OrganizationUnitSnapshot {
    return {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      kind: unit.kind,
      parentId: unit.parentId,
    }
  }
}
