import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { AuditContract, InvalidAuditEntryError } from '../contracts/index.js'
import type { AuditEntryInput, AuditEntrySnapshot } from '../contracts/index.js'
import { AuditEntryEntity } from '../entities/audit_entry.entity.js'
import { currentEventMetadata } from '@platform/context/index.js'

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

    try {
      const manager = options?.client ?? this.repo.manager
      const metadata = currentEventMetadata()
      const eventId = input.eventId?.trim() || metadata.eventId || null
      if (eventId) {
        const existing = await manager.findOne(AuditEntryEntity, { where: { eventId } })
        if (existing) return ok(TypeOrmAuditService.snapshot(existing))
      }
      const entry = manager.create(AuditEntryEntity, {
        actorId: input.actorId?.trim() || metadata.actorId,
        action,
        entityType,
        entityId,
        beforeValue: (input.beforeValue as Record<string, unknown>) ?? null,
        afterValue: (input.afterValue as Record<string, unknown>) ?? null,
        requestId: input.requestId?.trim() || metadata.requestId,
        eventId,
        occurredAt: new Date(),
      })

      const saved = await manager.save(entry)
      return ok(TypeOrmAuditService.snapshot(saved))
    } catch {
      return err(new InvalidAuditEntryError('Unable to persist audit entry'))
    }
  }

  private static snapshot(entry: AuditEntryEntity): AuditEntrySnapshot {
    return {
      id: Number(entry.id),
      ...(entry.actorId ? { actorId: entry.actorId } : {}),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.beforeValue ? { beforeValue: entry.beforeValue } : {}),
      ...(entry.afterValue ? { afterValue: entry.afterValue } : {}),
      ...(entry.requestId ? { requestId: entry.requestId } : {}),
      ...(entry.eventId ? { eventId: entry.eventId } : {}),
      occurredAt: entry.occurredAt,
    }
  }
}
