import * as v from 'valibot'
import {
  apiBase,
  currencySchema,
  dateSchema,
  domainErrors,
  idSchema,
  integerStringSchema,
  timestampSchema,
  unsignedIntegerStringSchema,
} from '../../../platform/http/api_schemas.js'

const normalBalanceSchema = v.picklist(['DEBIT', 'CREDIT'])
const accountInputSchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  code: idSchema,
  name: idSchema,
  normalBalance: normalBalanceSchema,
})

export const accountSchema = v.strictObject({
  ...accountInputSchema.entries,
  isActive: v.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const periodInputSchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  code: idSchema,
  startsOn: dateSchema,
  endsOn: dateSchema,
})

export const accountingPeriodSchema = v.strictObject({
  ...periodInputSchema.entries,
  status: v.picklist(['OPEN', 'LOCKED', 'CLOSED']),
})

export const companyAccountingSettingsSchema = v.strictObject({
  companyId: idSchema,
  baseCurrency: currencySchema,
})

export const createJournalEntrySchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  number: idSchema,
  accountingDate: dateSchema,
  currency: currencySchema,
  memo: v.nullish(v.string(), () => undefined),
  lines: v.pipe(
    v.array(
      v.strictObject({
        accountId: idSchema,
        debitMinorUnits: integerStringSchema,
        creditMinorUnits: integerStringSchema,
        memo: v.nullish(v.string(), () => undefined),
      })
    ),
    v.minLength(2)
  ),
})

export const journalEntrySchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  number: idSchema,
  accountingDate: dateSchema,
  currency: currencySchema,
  status: v.picklist(['DRAFT', 'POSTED', 'VOID']),
  totalDebitMinorUnits: unsignedIntegerStringSchema,
  totalCreditMinorUnits: unsignedIntegerStringSchema,
  memo: v.optional(v.string()),
})

export const ledgerLineSchema = v.strictObject({
  entryId: idSchema,
  entryNumber: idSchema,
  accountingDate: dateSchema,
  accountId: idSchema,
  accountCode: idSchema,
  accountName: idSchema,
  debitMinorUnits: unsignedIntegerStringSchema,
  creditMinorUnits: unsignedIntegerStringSchema,
  currency: currencySchema,
})

export const trialBalanceLineSchema = v.strictObject({
  accountId: idSchema,
  accountCode: idSchema,
  accountName: idSchema,
  debitMinorUnits: unsignedIntegerStringSchema,
  creditMinorUnits: unsignedIntegerStringSchema,
})

const byIdSchema = v.strictObject({ id: idSchema })
const reportInputSchema = v.strictObject({ companyId: idSchema, from: dateSchema, to: dateSchema })

export const financeApiContract = {
  accounts: {
    store: apiBase
      .route({ method: 'POST', path: '/api/finance/accounts', successStatus: 201 })
      .input(accountInputSchema)
      .output(accountSchema)
      .errors(domainErrors(['INVALID_ACCOUNT', 'ACCOUNT_ALREADY_EXISTS'])),
    show: apiBase
      .route({ method: 'GET', path: '/api/finance/accounts/{id}' })
      .input(byIdSchema)
      .output(accountSchema)
      .errors(domainErrors(['ACCOUNT_NOT_FOUND'])),
  },
  accountingPeriods: {
    store: apiBase
      .route({ method: 'POST', path: '/api/finance/accounting-periods', successStatus: 201 })
      .input(periodInputSchema)
      .output(accountingPeriodSchema)
      .errors(domainErrors(['ACCOUNTING_PERIOD_UNAVAILABLE'])),
    lock: apiBase
      .route({ method: 'POST', path: '/api/finance/accounting-periods/{id}/lock' })
      .input(byIdSchema)
      .output(accountingPeriodSchema)
      .errors(domainErrors(['ACCOUNTING_PERIOD_UNAVAILABLE'])),
  },
  companyAccountingSettings: {
    store: apiBase
      .route({
        method: 'POST',
        path: '/api/finance/company-accounting-settings',
        successStatus: 201,
      })
      .input(companyAccountingSettingsSchema)
      .output(companyAccountingSettingsSchema)
      .errors(domainErrors(['COMPANY_ACCOUNTING_SETTINGS_INVALID'])),
  },
  journalEntries: {
    store: apiBase
      .route({ method: 'POST', path: '/api/finance/journal-entries', successStatus: 201 })
      .input(createJournalEntrySchema)
      .output(journalEntrySchema)
      .errors(domainErrors(['JOURNAL_ENTRY_PERSISTENCE_ERROR'])),
    post: apiBase
      .route({ method: 'POST', path: '/api/finance/journal-entries/{id}/post' })
      .input(byIdSchema)
      .output(journalEntrySchema)
      .errors(
        domainErrors([
          'JOURNAL_ENTRY_NOT_FOUND',
          'JOURNAL_ENTRY_ALREADY_POSTED',
          'ACCOUNTING_PERIOD_UNAVAILABLE',
          'INACTIVE_ACCOUNT',
          'JOURNAL_ENTRY_PERSISTENCE_ERROR',
        ])
      ),
    reverse: apiBase
      .route({
        method: 'POST',
        path: '/api/finance/journal-entries/{entryId}/reverse',
        successStatus: 201,
      })
      .input(
        v.strictObject({
          entryId: idSchema,
          id: idSchema,
          number: idSchema,
          accountingDate: dateSchema,
          memo: v.nullish(v.string(), () => undefined),
        })
      )
      .output(journalEntrySchema)
      .errors(
        domainErrors([
          'JOURNAL_ENTRY_NOT_FOUND',
          'JOURNAL_ENTRY_ALREADY_POSTED',
          'JOURNAL_ENTRY_ALREADY_REVERSED',
          'ACCOUNTING_PERIOD_UNAVAILABLE',
          'JOURNAL_ENTRY_PERSISTENCE_ERROR',
        ])
      ),
    ledger: apiBase
      .route({ method: 'GET', path: '/api/finance/general-ledger' })
      .input(reportInputSchema)
      .output(v.array(ledgerLineSchema))
      .errors(domainErrors(['FINANCE_QUERY_ERROR'])),
    trialBalance: apiBase
      .route({ method: 'GET', path: '/api/finance/trial-balance' })
      .input(reportInputSchema)
      .output(v.array(trialBalanceLineSchema))
      .errors(domainErrors(['FINANCE_QUERY_ERROR'])),
  },
}
