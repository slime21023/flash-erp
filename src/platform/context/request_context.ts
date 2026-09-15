import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

export type EventMetadata = Readonly<{
  actorId: string
  requestId: string
  eventId?: string
}>

export type RequestScope = Readonly<{
  organizationUnitId: string
}>

export type RequestContext = EventMetadata & {
  organizationUnitId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback)
}

export function currentEventMetadata(): EventMetadata {
  const context = storage.getStore()
  return context
    ? {
        actorId: context.actorId,
        requestId: context.requestId,
        ...(context.eventId ? { eventId: context.eventId } : {}),
      }
    : { actorId: 'system', requestId: randomUUID() }
}

export function currentRequestScope(
  options?: Readonly<{ scope?: RequestScope }>
): RequestScope | undefined {
  const explicit = options?.scope?.organizationUnitId?.trim()
  if (explicit) return { organizationUnitId: explicit }

  const selected = storage.getStore()?.organizationUnitId?.trim()
  return selected ? { organizationUnitId: selected } : undefined
}

export function scopeMismatch(
  expectedOrganizationUnitId: string,
  options?: Readonly<{ scope?: RequestScope }>
): string | undefined {
  const selected = currentRequestScope(options)?.organizationUnitId
  return selected && selected !== expectedOrganizationUnitId ? selected : undefined
}

export function requestIdFromHeader(value: unknown): string {
  const requestId = typeof value === 'string' ? value.trim() : ''
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId) ? requestId : randomUUID()
}
