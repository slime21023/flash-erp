import type { Result } from '#platform/fp/index'
import type { TransactionOptions } from '#platform/persistence/index'
import type { OrganizationUnitNotFoundError } from './organization_errors.js'

export type OrganizationUnitKind = 'COMPANY' | 'PLANT' | 'WAREHOUSE'

export type OrganizationUnitSnapshot = Readonly<{
  id: string
  code: string
  name: string
  kind: OrganizationUnitKind
  parentId: string | null
}>

export abstract class OrganizationContract {
  abstract findUnit(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, OrganizationUnitNotFoundError>>
}
