import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { AuditContract, InvalidAuditEntryError } from '../contracts/index.js'
import type { AuditEntryInput, AuditEntrySnapshot } from '../contracts/index.js'
import { AuditEntryEntity } from '../entities/audit_entry.entity.js'

@Injectable()
export class TypeOrmAuditService extends AuditContract {
  constructor(
    @InjectRepository(AuditEntryEntity)
    private readonly repo: Repository<AuditEntryEntity>
  ) {
    super()
  }

  async append(
    input: AuditEntryInput,
    options?: TransactionOptions
  ): Promise<Result<AuditEntrySnapshot, InvalidAuditEntryError>> {
    const action = typeof input?.action === 'string' ? input.action.trim() : ''
    const entityType = typeof input?.entityType === 'string' ? input.entityType.trim() : ''
    const entityId = typeof input?.entityId === 'string' ? input.entityId.trim() : ''

    if (!action || !entityType || !entityId) {
      return err(new InvalidAuditEntryError('action, entityType, and entityId are required'))
    }

    const manager = options?.client ?? this.repo.manager
    const entry = manager.create(AuditEntryEntity, {
      actorId: input.actorId?.trim() || null,
      action,
      entityType,
      entityId,
      beforeValue: (input.beforeValue as Record<string, unknown>) ?? null,
      afterValue: (input.afterValue as Record<string, unknown>) ?? null,
      requestId: input.requestId?.trim() || null,
      occurredAt: new Date(),
    })

    const saved = await manager.save(entry)

    return ok({
      id: Number(saved.id),
      ...(saved.actorId ? { actorId: saved.actorId } : {}),
      action: saved.action,
      entityType: saved.entityType,
      entityId: saved.entityId,
      ...(saved.beforeValue ? { beforeValue: saved.beforeValue } : {}),
      ...(saved.afterValue ? { afterValue: saved.afterValue } : {}),
      ...(saved.requestId ? { requestId: saved.requestId } : {}),
      occurredAt: saved.occurredAt,
    })
  }
}
