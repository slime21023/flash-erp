import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
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
import { OrganizationUnitEntity } from '../entities/organization_unit.entity.js'

@Injectable()
export class TypeOrmOrganizationService extends OrganizationContract {
  constructor(
    @InjectRepository(OrganizationUnitEntity)
    private readonly repo: Repository<OrganizationUnitEntity>
  ) {
    super()
  }

  async registerUnit(
    input: RegisterOrganizationUnitInput,
    options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, RegisterOrganizationUnitError>> {
    const id = typeof input?.id === 'string' ? input.id.trim() : ''
    const code = typeof input?.code === 'string' ? input.code.trim().toUpperCase() : ''
    const name = typeof input?.name === 'string' ? input.name.trim() : ''

    if (id.length === 0 || code.length === 0 || name.length === 0) {
      return err(new InvalidOrganizationUnitError('id, code, and name are required'))
    }

    const manager = options?.client ?? this.repo.manager

    const duplicate = await manager
      .createQueryBuilder(OrganizationUnitEntity, 'u')
      .where('u.id = :id OR u.code = :code', { id, code })
      .getOne()

    if (duplicate) {
      return err(
        new OrganizationUnitAlreadyExistsError(
          duplicate.id === id ? id : code,
          duplicate.id === id ? 'id' : 'code'
        )
      )
    }

    const parentId = input.parentId?.trim() || null
    let parent: OrganizationUnitEntity | null = null

    if (parentId !== null) {
      parent = await manager.findOne(OrganizationUnitEntity, { where: { id: parentId } })
      if (!parent) {
        return err(new OrganizationUnitNotFoundError(parentId))
      }
    }

    if (!TypeOrmOrganizationService.isValidParent(input.kind, parent?.kind ?? null)) {
      return err(new InvalidOrganizationUnitError('Organization unit kind has an invalid parent'))
    }

    try {
      const entity = manager.create(OrganizationUnitEntity, {
        id,
        code,
        name,
        kind: input.kind,
        parentId,
      })
      await manager.save(entity)
      return ok(TypeOrmOrganizationService.toSnapshot(entity))
    } catch (error: any) {
      if (error?.code === '23505') {
        return err(new OrganizationUnitAlreadyExistsError(id))
      }
      return err(new InvalidOrganizationUnitError('Organization unit could not be saved'))
    }
  }

  async findUnit(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<OrganizationUnitSnapshot, OrganizationUnitNotFoundError>> {
    const manager = options?.client ?? this.repo.manager
    const entity = await manager.findOne(OrganizationUnitEntity, { where: { id } })
    return entity
      ? ok(TypeOrmOrganizationService.toSnapshot(entity))
      : err(new OrganizationUnitNotFoundError(id))
  }

  private static toSnapshot(unit: OrganizationUnitEntity): OrganizationUnitSnapshot {
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
}
