import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import {
  InvalidOrganizationUnitError,
  OrganizationContract,
  OrganizationUnitAlreadyExistsError,
  OrganizationUnitNotFoundError,
} from '../contracts/index.js'
import type {
  OrganizationUnitKind,
  OrganizationUnitSnapshot,
  RegisterOrganizationUnitError,
  RegisterOrganizationUnitInput,
} from '../contracts/index.js'

export class InMemoryOrganizationService extends OrganizationContract {
  readonly #units = new Map<string, OrganizationUnitSnapshot>()

  async registerUnit(
    input: RegisterOrganizationUnitInput,
    _options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, RegisterOrganizationUnitError>> {
    const id = typeof input?.id === 'string' ? input.id.trim() : ''
    const code = typeof input?.code === 'string' ? input.code.trim().toUpperCase() : ''
    const name = typeof input?.name === 'string' ? input.name.trim() : ''

    if (id.length === 0 || code.length === 0 || name.length === 0) {
      return err(new InvalidOrganizationUnitError('id, code, and name are required'))
    }

    if (this.#units.has(id)) {
      return err(new OrganizationUnitAlreadyExistsError(id))
    }
    if ([...this.#units.values()].some((unit) => unit.code === code)) {
      return err(new OrganizationUnitAlreadyExistsError(code, 'code'))
    }

    const parentId = input.parentId?.trim() || null
    const parent = parentId === null ? null : this.#units.get(parentId)
    if (parentId !== null && !parent) {
      return err(new OrganizationUnitNotFoundError(parentId))
    }
    if (!InMemoryOrganizationService.isValidParent(input.kind, parent?.kind ?? null)) {
      return err(new InvalidOrganizationUnitError('Organization unit kind has an invalid parent'))
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

  private static isValidParent(
    kind: OrganizationUnitKind,
    parentKind: OrganizationUnitKind | null
  ): boolean {
    if (kind === 'COMPANY') return parentKind === null
    if (kind === 'PLANT') return parentKind === 'COMPANY'
    return parentKind === 'PLANT'
  }
}
