import assert from 'node:assert/strict'
import { test } from 'vitest'
import { TypeOrmDocumentNumberGenerator } from '@platform/numbering/typeorm_document_number_generator.js'

function createMockEntityManager() {
  let counter = 0n
  return {
    query: async (_sql: string, _params: any[]) => {
      counter += 1n
      return [{ current_seq: counter }]
    },
  } as any
}

test('TypeOrmDocumentNumberGenerator generates formatted sequence using EntityManager', async () => {
  const manager = createMockEntityManager()
  const generator = new TypeOrmDocumentNumberGenerator(manager, {
    pattern: '{PREFIX}-{YYYY}{MM}-{SEQ:5}',
    prefix: 'PO',
    periodPartitioned: true,
  })

  const res1 = await generator.next('PO_SEQ', { date: '2026-09-09' })
  assert.equal(res1.isOk, true)
  if (res1.isOk) {
    assert.equal(res1.value, 'PO-202609-00001')
  }

  const res2 = await generator.next('PO_SEQ', { date: '2026-09-09' })
  assert.equal(res2.isOk, true)
  if (res2.isOk) {
    assert.equal(res2.value, 'PO-202609-00002')
  }
})

test('TypeOrmDocumentNumberGenerator validates empty key or invalid pattern', async () => {
  const manager = createMockEntityManager()
  const generator = new TypeOrmDocumentNumberGenerator(manager, {
    pattern: 'INVALID_PATTERN_NO_SEQ',
    prefix: 'PO',
  })

  const errRes = await generator.next('KEY')
  assert.equal(errRes.isErr, true)
  if (errRes.isErr) {
    assert.equal(errRes.error.code, 'INVALID_NUMBERING_CONFIGURATION')
  }
})
