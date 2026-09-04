import assert from 'node:assert/strict'
import fc from 'fast-check'
import { test } from '@japa/runner'
import { JournalEntry } from '#modules/finance/contracts/index'
import type { JournalLine } from '#modules/finance/contracts/index'
import { InMemoryFinanceService } from '#modules/finance/services/in_memory_finance_service'
import { Money } from '#platform/kernel/index'

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
      const postResult = await service.post(entry.value)
      assert.equal(postResult.isOk, true)
      const duplicate = await service.post(entry.value)
      assert.equal(duplicate.isErr, true)
      if (duplicate.isErr) {
        assert.equal(duplicate.error.code, 'JOURNAL_ENTRY_ALREADY_POSTED')
      }
    }
  }
})
