import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type { InvalidAuditEntryError } from './audit_errors.js'

export type AuditEntryInput = Readonly<{
  actorId?: string
  action: string
  entityType: string
  entityId: string
  beforeValue?: Readonly<Record<string, unknown>>
  afterValue?: Readonly<Record<string, unknown>>
  requestId?: string
  eventId?: string
}>

export type AuditEntrySnapshot = Readonly<AuditEntryInput & { id: number; occurredAt: Date }>

/** Append-only audit writer. There is intentionally no update or delete operation. */
export abstract class AuditContract {
  abstract append(
    input: AuditEntryInput,
    options?: TransactionOptions
  ): Promise<Result<AuditEntrySnapshot, InvalidAuditEntryError>>
}
