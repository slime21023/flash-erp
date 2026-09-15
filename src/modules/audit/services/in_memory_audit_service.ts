import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { AuditContract, InvalidAuditEntryError } from '../contracts/index.js'
import type { AuditEntryInput, AuditEntrySnapshot } from '../contracts/index.js'

export class InMemoryAuditService extends AuditContract {
  readonly #entries: AuditEntrySnapshot[] = []
  #nextId = 1

  get entries(): readonly AuditEntrySnapshot[] {
    return Object.freeze([...this.#entries])
  }

  async append(
    input: AuditEntryInput,
    _options?: TransactionOptions
  ): Promise<Result<AuditEntrySnapshot, InvalidAuditEntryError>> {
    const action = typeof input?.action === 'string' ? input.action.trim() : ''
    const entityType = typeof input?.entityType === 'string' ? input.entityType.trim() : ''
    const entityId = typeof input?.entityId === 'string' ? input.entityId.trim() : ''

    if (!action || !entityType || !entityId) {
      return err(new InvalidAuditEntryError('action, entityType, and entityId are required'))
    }

    const eventId = input.eventId?.trim()
    const existing = eventId ? this.#entries.find((entry) => entry.eventId === eventId) : undefined
    if (existing) return ok(existing)

    const snapshot: AuditEntrySnapshot = Object.freeze({
      id: this.#nextId++,
      ...(input.actorId && typeof input.actorId === 'string'
        ? { actorId: input.actorId.trim() }
        : {}),
      action,
      entityType,
      entityId,
      ...(input.beforeValue ? { beforeValue: Object.freeze({ ...input.beforeValue }) } : {}),
      ...(input.afterValue ? { afterValue: Object.freeze({ ...input.afterValue }) } : {}),
      ...(input.requestId && typeof input.requestId === 'string'
        ? { requestId: input.requestId.trim() }
        : {}),
      ...(eventId ? { eventId } : {}),
      occurredAt: new Date(),
    })

    this.#entries.push(snapshot)
    return ok(snapshot)
  }
}
