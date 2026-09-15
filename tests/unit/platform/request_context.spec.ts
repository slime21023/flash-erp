import assert from 'node:assert/strict'
import { test } from 'vitest'
import { AppController } from '../../../src/app.controller.js'
import { InMemoryAuditService } from '@modules/audit/services/in_memory_audit_service.js'
import { SalesAuditListener } from '@modules/audit/listeners/sales_audit_listener.js'
import { SalesOrderConfirmedEvent } from '@modules/sales/contracts/index.js'
import {
  currentEventMetadata,
  requestIdFromHeader,
  runWithRequestContext,
} from '@platform/context/index.js'

test('request context is preserved in domain event metadata', () => {
  const event = runWithRequestContext(
    { actorId: 'user-42', requestId: 'request-42' },
    () => new SalesOrderConfirmedEvent('so-1', 'org-1', 'cust-1', 100n, new Date())
  )

  assert.deepEqual(event.eventMetadata, { actorId: 'user-42', requestId: 'request-42' })
})

test('audit listeners persist event actor and request metadata', async () => {
  const audit = new InMemoryAuditService()
  const listener = new SalesAuditListener(audit)
  const event = runWithRequestContext(
    { actorId: 'user-42', requestId: 'request-42' },
    () => new SalesOrderConfirmedEvent('so-1', 'org-1', 'cust-1', 100n, new Date())
  )

  await listener.handleSalesOrderConfirmed(event)
  assert.equal(audit.entries[0]?.actorId, 'user-42')
  assert.equal(audit.entries[0]?.requestId, 'request-42')
})

test('invalid request IDs are replaced and valid IDs are preserved', () => {
  assert.equal(requestIdFromHeader('request-42'), 'request-42')
  assert.notEqual(requestIdFromHeader('contains spaces'), 'contains spaces')
  assert.notEqual(requestIdFromHeader(undefined), '')
  assert.equal(currentEventMetadata().actorId, 'system')
})

test('readiness reports database state', async () => {
  const readyController = new AppController({
    isInitialized: true,
    query: async () => [],
  } as any)
  assert.deepEqual(await readyController.readiness(), {
    service: 'flash-erp',
    status: 'ready',
    database: 'ok',
  })

  const unavailableController = new AppController()
  await assert.rejects(
    () => unavailableController.readiness(),
    (error: unknown) => {
      return error instanceof Error && (error as any).getStatus?.() === 503
    }
  )
})
