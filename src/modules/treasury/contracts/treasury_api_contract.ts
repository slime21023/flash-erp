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

const text = v.pipe(v.string(), v.minLength(1))
const optionalText = v.nullish(v.string(), () => undefined)
const nullableText = v.nullish(v.string())
const idInput = v.strictObject({ id: idSchema })
const bankAccount = v.object({
  id: idSchema,
  companyId: idSchema,
  accountNumber: text,
  bankCode: text,
  bankName: text,
  accountName: text,
  currency: currencySchema,
  glAccountId: idSchema,
  currentBalanceMinorUnits: integerStringSchema,
  isActive: v.boolean(),
})
const paymentLine = v.strictObject({
  invoiceId: idSchema,
  appliedAmountMinorUnits: unsignedIntegerStringSchema,
  memo: optionalText,
})
const payment = v.object({
  id: idSchema,
  companyId: idSchema,
  bankAccountId: idSchema,
  paymentNumber: text,
  paymentDate: dateSchema,
  beneficiaryType: v.picklist(['SUPPLIER', 'OTHER']),
  beneficiaryId: idSchema,
  currency: currencySchema,
  amountMinorUnits: integerStringSchema,
  status: v.picklist(['DRAFT', 'POSTED', 'CANCELLED']),
  journalEntryId: v.nullish(idSchema),
  memo: nullableText,
  lines: v.array(v.object({ ...paymentLine.entries, memo: nullableText })),
  postedAt: v.nullish(timestampSchema),
})
const receiptLine = v.strictObject({
  referenceId: idSchema,
  appliedAmountMinorUnits: unsignedIntegerStringSchema,
  memo: optionalText,
})
const receipt = v.object({
  id: idSchema,
  companyId: idSchema,
  bankAccountId: idSchema,
  receiptNumber: text,
  receiptDate: dateSchema,
  payerType: v.picklist(['CUSTOMER', 'OTHER']),
  payerId: idSchema,
  currency: currencySchema,
  amountMinorUnits: integerStringSchema,
  status: v.picklist(['DRAFT', 'POSTED', 'CANCELLED']),
  journalEntryId: v.nullish(idSchema),
  memo: nullableText,
  lines: v.array(v.object({ ...receiptLine.entries, memo: nullableText })),
  postedAt: v.nullish(timestampSchema),
})
const statementLine = v.strictObject({
  id: idSchema,
  transactionDate: dateSchema,
  direction: v.picklist(['DEBIT', 'CREDIT']),
  amountMinorUnits: integerStringSchema,
  reference: text,
  description: optionalText,
})
const statementInput = v.strictObject({
  id: idSchema,
  bankAccountId: idSchema,
  statementNumber: text,
  statementDate: dateSchema,
  openingBalanceMinorUnits: integerStringSchema,
  closingBalanceMinorUnits: integerStringSchema,
  lines: v.array(statementLine),
})

export const treasuryApiContract = {
  registerBankAccount: apiBase
    .route({
      method: 'POST',
      path: '/api/treasury/accounts',
      successStatus: 201,
      tags: ['Treasury'],
    })
    .input(
      v.strictObject({
        id: idSchema,
        companyId: idSchema,
        accountNumber: text,
        bankCode: text,
        bankName: text,
        accountName: text,
        currency: v.nullish(currencySchema, () => undefined),
        glAccountId: idSchema,
        initialBalanceMinorUnits: v.nullish(integerStringSchema, () => undefined),
      })
    )
    .output(bankAccount)
    .errors(domainErrors(['TREASURY_ERROR', 'BANK_ACCOUNT_ALREADY_EXISTS', 'SCOPE_FORBIDDEN'])),
  getBankAccount: apiBase
    .route({ method: 'GET', path: '/api/treasury/accounts/{id}', tags: ['Treasury'] })
    .input(idInput)
    .output(bankAccount)
    .errors(domainErrors(['BANK_ACCOUNT_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  listBankAccounts: apiBase
    .route({ method: 'GET', path: '/api/treasury/accounts', tags: ['Treasury'] })
    .input(v.strictObject({ companyId: idSchema }))
    .output(v.array(bankAccount))
    .errors(domainErrors(['TREASURY_ERROR', 'SCOPE_FORBIDDEN'])),
  createPayment: apiBase
    .route({
      method: 'POST',
      path: '/api/treasury/payments',
      successStatus: 201,
      tags: ['Treasury'],
    })
    .input(
      v.strictObject({
        id: idSchema,
        companyId: idSchema,
        bankAccountId: idSchema,
        paymentNumber: text,
        paymentDate: dateSchema,
        beneficiaryType: v.picklist(['SUPPLIER', 'OTHER']),
        beneficiaryId: idSchema,
        currency: v.nullish(currencySchema, () => undefined),
        amountMinorUnits: unsignedIntegerStringSchema,
        glPayableAccountId: v.nullish(idSchema, () => undefined),
        memo: optionalText,
        lines: v.nullish(v.array(paymentLine), () => undefined),
      })
    )
    .output(payment)
    .errors(domainErrors(['TREASURY_ERROR', 'BANK_ACCOUNT_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  postPayment: apiBase
    .route({ method: 'POST', path: '/api/treasury/payments/{id}/post', tags: ['Treasury'] })
    .input(idInput)
    .output(payment)
    .errors({
      ...domainErrors([
        'TREASURY_ERROR',
        'PAYMENT_NOT_FOUND',
        'INVALID_PAYMENT_STATE',
        'BANK_ACCOUNT_NOT_FOUND',
        'SCOPE_FORBIDDEN',
      ]),
      INSUFFICIENT_FUNDS: {
        status: 422,
        data: v.object({
          accountId: idSchema,
          currentBalanceMinorUnits: integerStringSchema,
          requestedAmountMinorUnits: integerStringSchema,
        }),
      },
    }),
  getPayment: apiBase
    .route({ method: 'GET', path: '/api/treasury/payments/{id}', tags: ['Treasury'] })
    .input(idInput)
    .output(payment)
    .errors(domainErrors(['PAYMENT_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  createReceipt: apiBase
    .route({
      method: 'POST',
      path: '/api/treasury/receipts',
      successStatus: 201,
      tags: ['Treasury'],
    })
    .input(
      v.strictObject({
        id: idSchema,
        companyId: idSchema,
        bankAccountId: idSchema,
        receiptNumber: text,
        receiptDate: dateSchema,
        payerType: v.picklist(['CUSTOMER', 'OTHER']),
        payerId: idSchema,
        currency: v.nullish(currencySchema, () => undefined),
        amountMinorUnits: unsignedIntegerStringSchema,
        glReceivableAccountId: v.nullish(idSchema, () => undefined),
        memo: optionalText,
        lines: v.nullish(v.array(receiptLine), () => undefined),
      })
    )
    .output(receipt)
    .errors(domainErrors(['TREASURY_ERROR', 'BANK_ACCOUNT_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  postReceipt: apiBase
    .route({ method: 'POST', path: '/api/treasury/receipts/{id}/post', tags: ['Treasury'] })
    .input(idInput)
    .output(receipt)
    .errors(
      domainErrors([
        'TREASURY_ERROR',
        'RECEIPT_NOT_FOUND',
        'INVALID_RECEIPT_STATE',
        'BANK_ACCOUNT_NOT_FOUND',
        'SCOPE_FORBIDDEN',
      ])
    ),
  getReceipt: apiBase
    .route({ method: 'GET', path: '/api/treasury/receipts/{id}', tags: ['Treasury'] })
    .input(idInput)
    .output(receipt)
    .errors(domainErrors(['RECEIPT_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  importBankStatement: apiBase
    .route({
      method: 'POST',
      path: '/api/treasury/statements',
      successStatus: 201,
      tags: ['Treasury'],
    })
    .input(statementInput)
    .output(
      v.object({
        ...statementInput.entries,
        lines: v.array(
          v.object({
            ...statementLine.entries,
            description: nullableText,
            isMatched: v.boolean(),
            matchedVoucherId: v.nullish(idSchema),
          })
        ),
      })
    )
    .errors(domainErrors(['TREASURY_ERROR', 'BANK_ACCOUNT_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  reconcileBankStatement: apiBase
    .route({ method: 'POST', path: '/api/treasury/statements/{id}/reconcile', tags: ['Treasury'] })
    .input(idInput)
    .output(
      v.object({
        statementId: idSchema,
        bankAccountId: idSchema,
        bookBalanceMinorUnits: integerStringSchema,
        bankStatementBalanceMinorUnits: integerStringSchema,
        depositsInTransitMinorUnits: integerStringSchema,
        outstandingChecksMinorUnits: integerStringSchema,
        adjustedBookBalanceMinorUnits: integerStringSchema,
        adjustedBankBalanceMinorUnits: integerStringSchema,
        differenceMinorUnits: integerStringSchema,
        isBalanced: v.boolean(),
        matchedCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        unmatchedCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        matchedLineIds: v.array(idSchema),
        unmatchedLineIds: v.array(idSchema),
      })
    )
    .errors(
      domainErrors([
        'TREASURY_ERROR',
        'BANK_STATEMENT_NOT_FOUND',
        'BANK_ACCOUNT_NOT_FOUND',
        'SCOPE_FORBIDDEN',
      ])
    ),
}
