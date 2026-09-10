import assert from 'node:assert/strict'
import fc from 'fast-check'
import { test } from 'vitest'
import { InMemoryAuditService } from '@modules/audit/services/in_memory_audit_service.js'

test('audit service appends and retrieves audit entries', async () => {
  const service = new InMemoryAuditService()
  const result = await service.append({
    actorId: 'user-001',
    action: 'order.created',
    entityType: 'order',
    entityId: 'ord-1001',
    beforeValue: { status: 'NONE' },
    afterValue: { status: 'CREATED', total: 500 },
    requestId: 'req-abc-123',
  })

  assert.equal(result.isOk, true)
  if (result.isOk) {
    assert.equal(result.value.id, 1)
    assert.equal(result.value.actorId, 'user-001')
    assert.equal(result.value.action, 'order.created')
    assert.equal(result.value.entityType, 'order')
    assert.equal(result.value.entityId, 'ord-1001')
    assert.deepEqual(result.value.beforeValue, { status: 'NONE' })
    assert.deepEqual(result.value.afterValue, { status: 'CREATED', total: 500 })
    assert.equal(result.value.requestId, 'req-abc-123')
    assert.equal(result.value.occurredAt instanceof Date, true)
  }

  assert.equal(service.entries.length, 1)
  assert.equal(service.entries[0]?.id, 1)
})

test('audit service validates required fields without throwing exceptions', async () => {
  const service = new InMemoryAuditService()

  // Missing action
  const noAction = await service.append({
    action: '',
    entityType: 'order',
    entityId: 'ord-1',
  })
  assert.equal(noAction.isErr, true)
  if (noAction.isErr) {
    assert.equal(noAction.error.code, 'INVALID_AUDIT_ENTRY')
  }

  // Whitespace-only entityType
  const wsType = await service.append({
    action: 'delete',
    entityType: '   ',
    entityId: 'ord-1',
  })
  assert.equal(wsType.isErr, true)
  if (wsType.isErr) {
    assert.equal(wsType.error.code, 'INVALID_AUDIT_ENTRY')
  }

  // Missing entityId
  const noEntityId = await service.append({
    action: 'delete',
    entityType: 'order',
    entityId: '',
  })
  assert.equal(noEntityId.isErr, true)
  if (noEntityId.isErr) {
    assert.equal(noEntityId.error.code, 'INVALID_AUDIT_ENTRY')
  }

  // Nullish fields should return Result.err rather than throwing TypeError
  const nullish = await service.append({} as any)
  assert.equal(nullish.isErr, true)
  if (nullish.isErr) {
    assert.equal(nullish.error.code, 'INVALID_AUDIT_ENTRY')
  }
})

test('audit entries defensively copy and freeze stored records', async () => {
  const service = new InMemoryAuditService()
  const beforeObj = { status: 'DRAFT', counter: 1 }
  const afterObj = { status: 'APPROVED', counter: 2 }

  const result = await service.append({
    action: 'approve',
    entityType: 'document',
    entityId: 'doc-42',
    beforeValue: beforeObj,
    afterValue: afterObj,
  })

  assert.equal(result.isOk, true)
  if (result.isErr) return

  // Mutating original inputs must not mutate audit snapshot
  beforeObj.counter = 999
  assert.equal(result.value.beforeValue?.counter, 1)

  // Stored entry and entries array must be frozen
  assert.equal(Object.isFrozen(service.entries), true)
  assert.equal(Object.isFrozen(service.entries[0]), true)
  assert.equal(Object.isFrozen(service.entries[0]?.beforeValue), true)
})

test('audit entry IDs are strictly monotonic and entries are append-only (PBT)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          action: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          entityType: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          entityId: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          actorId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      async (inputs) => {
        const service = new InMemoryAuditService()
        let previousId = 0

        for (const input of inputs) {
          const res = await service.append(input)
          assert.equal(res.isOk, true)
          if (res.isOk) {
            assert.equal(res.value.id, previousId + 1)
            assert.equal(res.value.action, input.action.trim())
            assert.equal(res.value.entityType, input.entityType.trim())
            assert.equal(res.value.entityId, input.entityId.trim())
            previousId = res.value.id
          }
        }

        assert.equal(service.entries.length, inputs.length)
      }
    ),
    { numRuns: 1000 }
  )
})
