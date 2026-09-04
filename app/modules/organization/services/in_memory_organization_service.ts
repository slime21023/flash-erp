import { err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'
import type { TransactionOptions } from '#platform/persistence/index'
import {
  InvalidOrganizationUnitError,
  OrganizationContract,
  OrganizationUnitAlreadyExistsError,
  OrganizationUnitNotFoundError,
} from '#modules/organization/contracts/index'
import type {
  OrganizationUnitKind,
  OrganizationUnitSnapshot,
} from '#modules/organization/contracts/index'

export type RegisterOrganizationUnitInput = Readonly<{
  id: string
  code: string
  name: string
  kind: OrganizationUnitKind
  parentId?: string | null
}>

export class InMemoryOrganizationService extends OrganizationContract {
  readonly #units = new Map<string, OrganizationUnitSnapshot>()

  async register(
    input: RegisterOrganizationUnitInput,
    _options?: TransactionOptions
  ): Promise<
    Result<
      OrganizationUnitSnapshot,
      | InvalidOrganizationUnitError
      | OrganizationUnitAlreadyExistsError
      | OrganizationUnitNotFoundError
    >
  > {
    const id = input.id.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (id.length === 0 || code.length === 0 || name.length === 0) {
      return err(new InvalidOrganizationUnitError('id, code, and name are required'))
    }

    if (this.#units.has(id)) {
      return err(new OrganizationUnitAlreadyExistsError(id))
    }

    const parentId = input.parentId?.trim() || null
    if (parentId !== null && !this.#units.has(parentId)) {
      return err(new OrganizationUnitNotFoundError(parentId))
    }

    const unit = Object.freeze({
      id,
      code,
      name,
      kind: input.kind,
      parentId,
    })
    this.#units.set(id, unit)
    return ok(unit)
  }

  async findUnit(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, OrganizationUnitNotFoundError>> {
    const unit = this.#units.get(id)
    return unit ? ok(unit) : err(new OrganizationUnitNotFoundError(id))
  }
}
