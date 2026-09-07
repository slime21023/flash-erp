import OrganizationUnit from '#modules/organization/models/organization_unit'
import {
  InvalidOrganizationUnitError,
  OrganizationContract,
  OrganizationUnitAlreadyExistsError,
  OrganizationUnitNotFoundError,
} from '#modules/organization/contracts/index'
import type {
  OrganizationUnitKind,
  OrganizationUnitSnapshot,
  RegisterOrganizationUnitError,
  RegisterOrganizationUnitInput,
} from '#modules/organization/contracts/index'
import type { TransactionOptions } from '#platform/persistence/index'
import { err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'

export class LucidOrganizationService extends OrganizationContract {
  async registerUnit(
    input: RegisterOrganizationUnitInput,
    options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, RegisterOrganizationUnitError>> {
    const id = input.id.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()
    if (id.length === 0 || code.length === 0 || name.length === 0) {
      return err(new InvalidOrganizationUnitError('id, code, and name are required'))
    }

    const duplicateQuery = OrganizationUnit.query()
    if (options?.client) duplicateQuery.useTransaction(options.client)
    const duplicate = await duplicateQuery.where('id', id).orWhere('code', code).first()
    if (duplicate) {
      return err(
        new OrganizationUnitAlreadyExistsError(
          duplicate.id === id ? id : code,
          duplicate.id === id ? 'id' : 'code'
        )
      )
    }

    const parentId = input.parentId?.trim() || null
    const parentQuery = OrganizationUnit.query()
    if (options?.client) parentQuery.useTransaction(options.client)
    const parent = parentId === null ? null : await parentQuery.where('id', parentId).first()
    if (parentId !== null && !parent) {
      return err(new OrganizationUnitNotFoundError(parentId))
    }
    if (!LucidOrganizationService.isValidParent(input.kind, parent?.kind ?? null)) {
      return err(new InvalidOrganizationUnitError('Organization unit kind has an invalid parent'))
    }

    try {
      const unit = new OrganizationUnit()
      if (options?.client) unit.useTransaction(options.client)
      unit.fill({ id, code, name, kind: input.kind, parentId })
      await unit.save()
      return ok(LucidOrganizationService.toSnapshot(unit))
    } catch (error) {
      if (LucidOrganizationService.isUniqueViolation(error)) {
        return err(new OrganizationUnitAlreadyExistsError(id))
      }
      return err(new InvalidOrganizationUnitError('Organization unit could not be saved'))
    }
  }

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

  private static isValidParent(
    kind: OrganizationUnitKind,
    parentKind: OrganizationUnitKind | null
  ): boolean {
    if (kind === 'COMPANY') return parentKind === null
    if (kind === 'PLANT') return parentKind === 'COMPANY'
    return parentKind === 'PLANT'
  }

  private static isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
  }
}
