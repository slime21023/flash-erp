import assert from 'node:assert/strict'
import fc from 'fast-check'
import {
  InMemoryDocumentNumberGenerator,
  InvalidNumberingConfigurationError,
  InvalidNumberingDateError,
  InvalidNumberingKeyError,
  PatternDocumentNumberGenerator,
} from '#platform/numbering/index'
import { test } from '@japa/runner'

test('document numbers are monotonic per sequence key', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom('sales-order', 'purchase-order', 'invoice'), {
        minLength: 1,
        maxLength: 30,
      }),
      async (sequenceKeys) => {
        const generator = new InMemoryDocumentNumberGenerator('SO', 6)
        const lastByKey = new Map<string, bigint>()

        for (const sequenceKey of sequenceKeys) {
          const result = await generator.next(sequenceKey)
          assert.equal(result.isOk, true)
          if (result.isErr) {
            return
          }

          const serial = BigInt(result.value.slice(3))
          assert.equal(serial > (lastByKey.get(sequenceKey) ?? 0n), true)
          lastByKey.set(sequenceKey, serial)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PatternDocumentNumberGenerator rejects invalid dates and empty prefixes', async () => {
  const generator = new PatternDocumentNumberGenerator({
    pattern: '{PREFIX}-{YYYY}-{SEQ:4}',
    prefix: 'INV',
  })
  const invalidDate = await generator.next('invoice', { date: 'not-a-date' })
  assert.equal(invalidDate.isErr, true)
  if (invalidDate.isErr) {
    assert.equal(invalidDate.error instanceof InvalidNumberingDateError, true)
  }

  const emptyPrefix = new PatternDocumentNumberGenerator({
    pattern: '{PREFIX}-{SEQ:4}',
    prefix: ' ',
  })
  const result = await emptyPrefix.next('invoice')
  assert.equal(result.isErr, true)
  if (result.isErr) {
    assert.equal(result.error instanceof InvalidNumberingConfigurationError, true)
  }
})

test('PatternDocumentNumberGenerator preserves format and period monotonicity', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom('HQ', 'FACTORY_A', 'STORE_1'), {
        minLength: 1,
        maxLength: 20,
      }),
      async (branches) => {
        const generator = new PatternDocumentNumberGenerator({
          pattern: '{PREFIX}-{YYYY}{MM}-{ORG}-{SEQ:5}',
          prefix: 'INV',
          periodPartitioned: true,
        })

        const lastSequenceMap = new Map<string, number>()

        for (const branch of branches) {
          const res = await generator.next('invoice-seq', {
            date: '2026-09-04',
            variables: { ORG: branch },
          })

          assert.equal(res.isOk, true)
          if (res.isOk) {
            const match = /^INV-202609-([A-Z0-9_]+)-(\d{5})$/.exec(res.value)
            assert.equal(match !== null, true)
            if (match) {
              assert.equal(match[1], branch)
              const seqNum = Number.parseInt(match[2] ?? '0', 10)
              const last = lastSequenceMap.get('invoice-seq') ?? 0
              assert.equal(seqNum > last, true)
              lastSequenceMap.set('invoice-seq', seqNum)
            }
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PatternDocumentNumberGenerator errors on invalid configuration or empty key', async () => {
  const badGenerator = new PatternDocumentNumberGenerator({
    pattern: '{PREFIX}-INVALID-NO-SEQ',
    prefix: 'ERR',
  })

  const badPatternRes = await badGenerator.next('key')
  assert.equal(badPatternRes.isErr, true)
  if (badPatternRes.isErr) {
    assert.equal(badPatternRes.error instanceof InvalidNumberingConfigurationError, true)
  }

  const validGenerator = new PatternDocumentNumberGenerator({
    pattern: '{PREFIX}-{SEQ:4}',
    prefix: 'PO',
  })

  const emptyKeyRes = await validGenerator.next('   ')
  assert.equal(emptyKeyRes.isErr, true)
  if (emptyKeyRes.isErr) {
    assert.equal(emptyKeyRes.error instanceof InvalidNumberingKeyError, true)
  }
})
