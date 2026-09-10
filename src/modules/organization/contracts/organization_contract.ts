import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type {
  InvalidOrganizationUnitError,
  OrganizationUnitAlreadyExistsError,
  OrganizationUnitNotFoundError,
} from './organization_errors.js'

export type OrganizationUnitKind = 'COMPANY' | 'PLANT' | 'WAREHOUSE'

export type OrganizationUnitSnapshot = Readonly<{
  id: string
  code: string
  name: string
  kind: OrganizationUnitKind
  parentId: string | null
}>

export type RegisterOrganizationUnitInput = Readonly<{
  id: string
  code: string
  name: string
  kind: OrganizationUnitKind
  parentId?: string | null
}>

export type RegisterOrganizationUnitError =
  InvalidOrganizationUnitError | OrganizationUnitAlreadyExistsError | OrganizationUnitNotFoundError

export abstract class OrganizationContract {
  abstract registerUnit(
    input: RegisterOrganizationUnitInput,
    options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, RegisterOrganizationUnitError>>

  abstract findUnit(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, OrganizationUnitNotFoundError>>
}
