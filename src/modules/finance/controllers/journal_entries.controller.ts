import { Controller, Headers } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import type * as v from 'valibot'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import { Money } from '@platform/kernel/index.js'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { FinanceContract, JournalEntryPersistenceError } from '../contracts/index.js'
import type { CreateJournalEntryDraftInput, JournalLine } from '../contracts/index.js'
import { createJournalEntrySchema, financeApiContract } from '../contracts/finance_api_contract.js'

@Controller()
export class JournalEntriesController {
  constructor(private readonly finance: FinanceContract) {}

  @RequirePermission('finance.journal.create')
  @Implement(financeApiContract.journalEntries.store)
  store() {
    return implement(financeApiContract.journalEntries.store).handler(async ({ input }) => {
      const draft = JournalEntriesController.toDraftInput(input)
      if (draft.isErr) return unwrapResult(err(draft.error))
      return unwrapResult(await this.finance.createDraft(draft.value))
    })
  }

  @RequirePermission('finance.voucher.post')
  @Implement(financeApiContract.journalEntries.post)
  post(@Headers('x-request-id') requestId?: string) {
    return implement(financeApiContract.journalEntries.post).handler(async ({ input }) =>
      unwrapResult(
        await this.finance.postDraft(
          input.id,
          requestId ? { requestId: requestId.trim() } : undefined
        )
      )
    )
  }

  @RequirePermission('finance.journal.reverse')
  @Implement(financeApiContract.journalEntries.reverse)
  reverse(@Headers('x-request-id') requestId?: string) {
    return implement(financeApiContract.journalEntries.reverse).handler(async ({ input }) => {
      const { entryId, ...reversal } = input
      return unwrapResult(
        await this.finance.reverse(
          entryId,
          reversal,
          requestId ? { requestId: requestId.trim() } : undefined
        )
      )
    })
  }

  @RequirePermission('finance.report.read')
  @Implement(financeApiContract.journalEntries.ledger)
  ledger() {
    return implement(financeApiContract.journalEntries.ledger).handler(async ({ input }) =>
      unwrapResult(await this.finance.ledger(input.companyId, input.from, input.to))
    )
  }

  @RequirePermission('finance.report.read')
  @Implement(financeApiContract.journalEntries.trialBalance)
  trialBalance() {
    return implement(financeApiContract.journalEntries.trialBalance).handler(async ({ input }) =>
      unwrapResult(await this.finance.trialBalance(input.companyId, input.from, input.to))
    )
  }

  private static toDraftInput(
    payload: v.InferOutput<typeof createJournalEntrySchema>
  ): Result<CreateJournalEntryDraftInput, JournalEntryPersistenceError> {
    const lines: JournalLine[] = []
    for (const line of payload.lines) {
      const debit = Money.fromMinorUnits(BigInt(line.debitMinorUnits), payload.currency)
      const credit = Money.fromMinorUnits(BigInt(line.creditMinorUnits), payload.currency)
      if (debit.isErr || credit.isErr) {
        return err(new JournalEntryPersistenceError('Journal line amount is invalid'))
      }
      lines.push({
        accountId: line.accountId,
        debit: debit.value,
        credit: credit.value,
        ...(line.memo ? { memo: line.memo } : {}),
      })
    }
    return ok({
      id: payload.id,
      companyId: payload.companyId,
      number: payload.number,
      accountingDate: payload.accountingDate,
      lines,
      ...(payload.memo ? { memo: payload.memo } : {}),
    })
  }
}
