import assert from 'node:assert/strict'
import fc from 'fast-check'
import { test } from 'vitest'
import { JournalEntry } from '@modules/finance/contracts/index.js'
import type { JournalLine } from '@modules/finance/contracts/index.js'
import { InMemoryFinanceService } from '@modules/finance/services/in_memory_finance_service.js'
import { Money } from '@platform/kernel/index.js'

test('balanced journal entries preserve the debit-credit invariant', () => {
  fc.assert(
    fc.property(
      fc.array(fc.bigInt({ min: 1n, max: 1_000_000n }), { minLength: 1, maxLength: 20 }),
      (amounts) => {
        const lines: JournalLine[] = amounts.flatMap((amount, index) => {
          const debit = Money.fromMinorUnits(amount, 'TWD')
          const zero = Money.fromMinorUnits(0n, 'TWD')
          assert.equal(debit.isOk, true)
          assert.equal(zero.isOk, true)
          if (debit.isErr || zero.isErr) {
            return []
          }

          return [
            { accountId: `debit-${index}`, debit: debit.value, credit: zero.value },
            { accountId: `credit-${index}`, debit: zero.value, credit: debit.value },
          ]
        })

        const result = JournalEntry.create('entry-001', lines)
        assert.equal(result.isOk, true)
        if (result.isOk) {
          assert.equal(result.value.totalDebit.minorUnits, result.value.totalCredit.minorUnits)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('finance service rejects duplicate journal entries with Result.err', async () => {
  const debit = Money.fromMinorUnits(100n, 'TWD')
  const zero = Money.fromMinorUnits(0n, 'TWD')
  assert.equal(debit.isOk, true)
  assert.equal(zero.isOk, true)

  if (debit.isOk && zero.isOk) {
    const entry = JournalEntry.create('entry-001', [
      { accountId: 'cash', debit: debit.value, credit: zero.value },
      { accountId: 'revenue', debit: zero.value, credit: debit.value },
    ])
    assert.equal(entry.isOk, true)
    if (entry.isOk) {
      const service = new InMemoryFinanceService()
      const draftInput = {
        id: entry.value.id,
        companyId: 'company-001',
        number: 'JE-001',
        accountingDate: '2026-01-01',
        lines: entry.value.lines,
      }
      const draftResult = await service.createDraft(draftInput)
      assert.equal(draftResult.isOk, true)
      const postResult = await service.postDraft(entry.value.id)
      assert.equal(postResult.isOk, true)
      const duplicatePost = await service.postDraft(entry.value.id)
      assert.equal(duplicatePost.isErr, true)
      const duplicateDraft = await service.createDraft(draftInput)
      assert.equal(duplicateDraft.isErr, true)
    }
  }
})

test('journal entries defensively copy and freeze their lines', () => {
  const amount = Money.fromMinorUnits(100n, 'TWD')
  const zero = Money.fromMinorUnits(0n, 'TWD')
  assert.equal(amount.isOk, true)
  assert.equal(zero.isOk, true)
  if (amount.isErr || zero.isErr) return

  const line0 = { accountId: 'cash', debit: amount.value, credit: zero.value }
  const line1 = { accountId: 'revenue', debit: zero.value, credit: amount.value }
  const lines = [line0, line1]
  const entry = JournalEntry.create('entry-immutable', lines)
  assert.equal(entry.isOk, true)
  if (entry.isErr) return

  line0.accountId = 'mutated-cash'
  assert.equal(entry.value.lines[0]?.accountId, 'cash')
  assert.equal(Object.isFrozen(entry.value.lines), true)
  assert.equal(Object.isFrozen(entry.value.lines[0]), true)
})
