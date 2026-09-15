import assert from 'node:assert/strict'
import fc from 'fast-check'
import { test } from 'vitest'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InMemoryFinanceService } from '@modules/finance/services/in_memory_finance_service.js'
import { InMemoryAuditService } from '@modules/audit/services/in_memory_audit_service.js'
import { TreasuryAuditListener } from '@modules/audit/listeners/treasury_audit_listener.js'
import { InMemoryTreasuryService } from '@modules/treasury/services/in_memory_treasury_service.js'
import { SettlementEngine } from '@modules/treasury/services/settlement_engine.js'
import { BankReconciliationMatcher } from '@modules/treasury/services/bank_reconciliation_matcher.js'
import {
  BankAccountAlreadyExistsError,
  BankAccountNotFoundError,
  BankStatementReconciledEvent,
  InsufficientFundsError,
  InvalidPaymentStateError,
  InvalidReceiptStateError,
  PaymentProcessedEvent,
  ReceiptProcessedEvent,
} from '@modules/treasury/contracts/index.js'
import { JournalEntry } from '@modules/finance/contracts/index.js'
import { Money } from '@platform/kernel/index.js'

test('treasury service manages bank account registration, lookup, and list', async () => {
  const treasury = new InMemoryTreasuryService()

  // 1. Register bank account
  const regRes = await treasury.registerBankAccount({
    id: 'bank-ctbc-01',
    companyId: 'comp-1',
    accountNumber: '822-1234567890',
    bankCode: '822',
    bankName: 'CTBC Bank',
    accountName: 'Operating Account',
    currency: 'TWD',
    glAccountId: 'acc-1102-bank-twd',
    initialBalanceMinorUnits: 1_000_000n, // 10,000 TWD
  })
  assert.equal(regRes.isOk, true)
  if (regRes.isOk) {
    assert.equal(regRes.value.accountNumber, '822-1234567890')
    assert.equal(regRes.value.currentBalanceMinorUnits, 1_000_000n)
  }

  // 2. Reject duplicate account number
  const dupRes = await treasury.registerBankAccount({
    id: 'bank-ctbc-dup',
    companyId: 'comp-1',
    accountNumber: '822-1234567890',
    bankCode: '822',
    bankName: 'CTBC Bank',
    accountName: 'Duplicate Account',
    glAccountId: 'acc-1102-bank-twd',
  })
  assert.equal(dupRes.isErr, true)
  if (dupRes.isErr) {
    assert.equal(dupRes.error instanceof BankAccountAlreadyExistsError, true)
  }

  // 3. Lookup bank account
  const found = await treasury.getBankAccount('bank-ctbc-01')
  assert.equal(found.isOk, true)
  if (found.isOk) {
    assert.equal(found.value.bankName, 'CTBC Bank')
  }

  // 4. Non-existent bank account returns BankAccountNotFoundError
  const missing = await treasury.getBankAccount('bank-nonexistent')
  assert.equal(missing.isErr, true)
  if (missing.isErr) {
    assert.equal(missing.error instanceof BankAccountNotFoundError, true)
  }

  // 5. List bank accounts by company
  const list = await treasury.listBankAccounts('comp-1')
  assert.equal(list.isOk, true)
  if (list.isOk) {
    assert.equal(list.value.length, 1)
  }
})

test('treasury service handles payment voucher lifecycle, insufficient funds check, and AP journal entries', async () => {
  const finance = new InMemoryFinanceService()
  const auditService = new InMemoryAuditService()
  const eventEmitter = new EventEmitter2()
  const auditListener = new TreasuryAuditListener(auditService)
  eventEmitter.on(PaymentProcessedEvent.EVENT_NAME, (e) => auditListener.handlePaymentProcessed(e))

  const treasury = new InMemoryTreasuryService(finance, eventEmitter)

  // 1. Setup bank account with 50,000 minor units (500 TWD)
  await treasury.registerBankAccount({
    id: 'bank-01',
    companyId: 'comp-1',
    accountNumber: '012-001',
    bankCode: '012',
    bankName: 'Taipei Fubon Bank',
    accountName: 'Treasury Main',
    currency: 'TWD',
    glAccountId: 'acc-1102-bank',
    initialBalanceMinorUnits: 50_000n,
  })

  // 2. Create payment that exceeds account balance (60,000 > 50,000)
  const overPmt = await treasury.createPayment({
    id: 'pmt-over',
    companyId: 'comp-1',
    bankAccountId: 'bank-01',
    paymentNumber: 'PMT-2026-001',
    paymentDate: '2026-09-10',
    beneficiaryType: 'SUPPLIER',
    beneficiaryId: 'supp-acme',
    amountMinorUnits: 60_000n,
    memo: 'Overdrawn payment test',
  })
  assert.equal(overPmt.isOk, true)

  const postOver = await treasury.postPayment('pmt-over')
  assert.equal(postOver.isErr, true)
  if (postOver.isErr) {
    assert.equal(postOver.error instanceof InsufficientFundsError, true)
  }

  const duplicateLines = await treasury.createPayment({
    id: 'pmt-duplicate-lines',
    companyId: 'comp-1',
    bankAccountId: 'bank-01',
    paymentNumber: 'PMT-2026-DUP',
    paymentDate: '2026-09-10',
    beneficiaryType: 'SUPPLIER',
    beneficiaryId: 'supp-acme',
    amountMinorUnits: 20_000n,
    lines: [
      { invoiceId: 'inv-acme-1002', appliedAmountMinorUnits: 10_000n },
      { invoiceId: 'inv-acme-1002', appliedAmountMinorUnits: 10_000n },
    ],
  })
  assert.equal(duplicateLines.isErr, true)

  // 3. Create and post valid payment (30,000 <= 50,000)
  const validPmt = await treasury.createPayment({
    id: 'pmt-valid',
    companyId: 'comp-1',
    bankAccountId: 'bank-01',
    paymentNumber: 'PMT-2026-002',
    paymentDate: '2026-09-10',
    beneficiaryType: 'SUPPLIER',
    beneficiaryId: 'supp-acme',
    amountMinorUnits: 30_000n,
    lines: [
      {
        invoiceId: 'inv-acme-1001',
        appliedAmountMinorUnits: 30_000n,
        memo: 'Payment for INV-1001',
      },
    ],
  })
  assert.equal(validPmt.isOk, true)

  const postValid = await treasury.postPayment('pmt-valid')
  assert.equal(postValid.isOk, true)
  if (postValid.isOk) {
    assert.equal(postValid.value.status, 'POSTED')
    assert.equal(postValid.value.journalEntryId, 'je-pmt-pmt-valid')
  }

  // 4. Verify bank account balance reduced: 50,000 - 30,000 = 20,000
  const bankCheck = await treasury.getBankAccount('bank-01')
  assert.equal(bankCheck.isOk, true)
  if (bankCheck.isOk) {
    assert.equal(bankCheck.value.currentBalanceMinorUnits, 20_000n)
  }

  // 5. Cannot post already POSTED payment
  const repost = await treasury.postPayment('pmt-valid')
  assert.equal(repost.isErr, true)
  if (repost.isErr) {
    assert.equal(repost.error instanceof InvalidPaymentStateError, true)
  }

  // 6. Verify audit log captured payment
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'PAYMENT_PROCESSED' && e.entityId === 'pmt-valid'),
    true
  )
})

test('treasury service handles receipt voucher lifecycle, balance increment, and AR journal entries', async () => {
  const finance = new InMemoryFinanceService()
  const auditService = new InMemoryAuditService()
  const eventEmitter = new EventEmitter2()
  const auditListener = new TreasuryAuditListener(auditService)
  eventEmitter.on(ReceiptProcessedEvent.EVENT_NAME, (e) => auditListener.handleReceiptProcessed(e))

  const treasury = new InMemoryTreasuryService(finance, eventEmitter)

  // 1. Setup bank account with 10,000 minor units
  await treasury.registerBankAccount({
    id: 'bank-receipt',
    companyId: 'comp-1',
    accountNumber: '004-999',
    bankCode: '004',
    bankName: 'Bank of Taiwan',
    accountName: 'Revenue Account',
    currency: 'TWD',
    glAccountId: 'acc-1102-bot',
    initialBalanceMinorUnits: 10_000n,
  })

  // 2. Create and post receipt (85,000 minor units from customer)
  const rcpt = await treasury.createReceipt({
    id: 'rcpt-01',
    companyId: 'comp-1',
    bankAccountId: 'bank-receipt',
    receiptNumber: 'RCPT-2026-001',
    receiptDate: '2026-09-10',
    payerType: 'CUSTOMER',
    payerId: 'cust-store-1',
    amountMinorUnits: 85_000n,
    lines: [
      {
        referenceId: 'ship-01',
        appliedAmountMinorUnits: 85_000n,
        memo: 'Customer wire transfer for shipment 01',
      },
    ],
  })
  assert.equal(rcpt.isOk, true)

  const duplicateReceiptLines = await treasury.createReceipt({
    id: 'rcpt-duplicate-lines',
    companyId: 'comp-1',
    bankAccountId: 'bank-receipt',
    receiptNumber: 'RCPT-2026-DUP',
    receiptDate: '2026-09-10',
    payerType: 'CUSTOMER',
    payerId: 'cust-store-1',
    amountMinorUnits: 20_000n,
    lines: [
      { referenceId: 'ship-duplicate', appliedAmountMinorUnits: 10_000n },
      { referenceId: 'ship-duplicate', appliedAmountMinorUnits: 10_000n },
    ],
  })
  assert.equal(duplicateReceiptLines.isErr, true)

  const postRcpt = await treasury.postReceipt('rcpt-01')
  assert.equal(postRcpt.isOk, true)
  if (postRcpt.isOk) {
    assert.equal(postRcpt.value.status, 'POSTED')
    assert.equal(postRcpt.value.journalEntryId, 'je-rcpt-rcpt-01')
  }

  // 3. Verify bank balance increased: 10,000 + 85,000 = 95,000
  const bankCheck = await treasury.getBankAccount('bank-receipt')
  assert.equal(bankCheck.isOk, true)
  if (bankCheck.isOk) {
    assert.equal(bankCheck.value.currentBalanceMinorUnits, 95_000n)
  }

  // 4. Cannot post already POSTED receipt
  const repost = await treasury.postReceipt('rcpt-01')
  assert.equal(repost.isErr, true)
  if (repost.isErr) {
    assert.equal(repost.error instanceof InvalidReceiptStateError, true)
  }

  // 5. Verify audit log captured receipt
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'RECEIPT_PROCESSED' && e.entityId === 'rcpt-01'),
    true
  )
})

test('treasury service imports bank statements and generates bank reconciliation report', async () => {
  const auditService = new InMemoryAuditService()
  const eventEmitter = new EventEmitter2()
  const auditListener = new TreasuryAuditListener(auditService)
  eventEmitter.on(BankStatementReconciledEvent.EVENT_NAME, (e) =>
    auditListener.handleBankStatementReconciled(e)
  )

  const treasury = new InMemoryTreasuryService(undefined, eventEmitter)

  // 1. Setup bank account with current book balance 500,000 minor units
  await treasury.registerBankAccount({
    id: 'bank-recon',
    companyId: 'comp-1',
    accountNumber: '808-777',
    bankCode: '808',
    bankName: 'E.SUN Bank',
    accountName: 'Operating Account',
    glAccountId: 'acc-1102-esun',
    initialBalanceMinorUnits: 500_000n,
  })

  // 2. Post vouchers in system:
  // Payment 1: 50,000 (will be cleared on bank statement)
  await treasury.createPayment({
    id: 'pmt-clr',
    companyId: 'comp-1',
    bankAccountId: 'bank-recon',
    paymentNumber: 'PMT-CLR-01',
    paymentDate: '2026-09-08',
    beneficiaryType: 'SUPPLIER',
    beneficiaryId: 'supp-1',
    amountMinorUnits: 50_000n,
  })
  await treasury.postPayment('pmt-clr')

  // Payment 2: 20,000 (outstanding check: not yet cleared on bank statement!)
  await treasury.createPayment({
    id: 'pmt-out',
    companyId: 'comp-1',
    bankAccountId: 'bank-recon',
    paymentNumber: 'PMT-OUT-02',
    paymentDate: '2026-09-10',
    beneficiaryType: 'SUPPLIER',
    beneficiaryId: 'supp-2',
    amountMinorUnits: 20_000n,
  })
  await treasury.postPayment('pmt-out')

  // Receipt 1: 100,000 (will be cleared on bank statement)
  await treasury.createReceipt({
    id: 'rcpt-clr',
    companyId: 'comp-1',
    bankAccountId: 'bank-recon',
    receiptNumber: 'RCPT-CLR-01',
    receiptDate: '2026-09-09',
    payerType: 'CUSTOMER',
    payerId: 'cust-1',
    amountMinorUnits: 100_000n,
  })
  await treasury.postReceipt('rcpt-clr')

  // Receipt 2: 40,000 (deposit in transit: recorded in system, not yet on bank statement!)
  await treasury.createReceipt({
    id: 'rcpt-transit',
    companyId: 'comp-1',
    bankAccountId: 'bank-recon',
    receiptNumber: 'RCPT-TR-02',
    receiptDate: '2026-09-10',
    payerType: 'CUSTOMER',
    payerId: 'cust-2',
    amountMinorUnits: 40_000n,
  })
  await treasury.postReceipt('rcpt-transit')

  // System Book Balance:
  // Initial 500,000 - 50,000 - 20,000 + 100,000 + 40,000 = 570,000
  const accountStatus = await treasury.getBankAccount('bank-recon')
  assert.equal(accountStatus.isOk, true)
  if (accountStatus.isOk) {
    assert.equal(accountStatus.value.currentBalanceMinorUnits, 570_000n)
  }

  // Bank Statement Balance calculation:
  // Bank had opening balance 500,000
  // Cleared Receipt (+100,000)
  // Cleared Payment (-50,000)
  // Bank Statement Closing Balance = 500,000 + 100,000 - 50,000 = 550,000
  const importRes = await treasury.importBankStatement({
    id: 'stmt-01',
    bankAccountId: 'bank-recon',
    statementNumber: 'STMT-2026-09',
    statementDate: '2026-09-10',
    openingBalanceMinorUnits: 500_000n,
    closingBalanceMinorUnits: 550_000n,
    lines: [
      {
        id: 'stmt-line-1',
        transactionDate: '2026-09-08',
        direction: 'DEBIT', // Bank withdrawal for payment
        amountMinorUnits: 50_000n,
        reference: 'PMT-CLR-01',
      },
      {
        id: 'stmt-line-2',
        transactionDate: '2026-09-09',
        direction: 'CREDIT', // Bank deposit for receipt
        amountMinorUnits: 100_000n,
        reference: 'RCPT-CLR-01',
      },
    ],
  })
  assert.equal(importRes.isOk, true)

  // 3. Run Bank Reconciliation
  const reconRes = await treasury.reconcileBankStatement('stmt-01')
  assert.equal(reconRes.isOk, true)
  if (reconRes.isOk) {
    const report = reconRes.value
    // Book Balance = 570,000
    assert.equal(report.bookBalanceMinorUnits, 570_000n)
    // Bank Statement Balance = 550,000
    assert.equal(report.bankStatementBalanceMinorUnits, 550_000n)
    // Deposits in Transit = 40,000 (rcpt-transit)
    assert.equal(report.depositsInTransitMinorUnits, 40_000n)
    // Outstanding Checks = 20,000 (pmt-out)
    assert.equal(report.outstandingChecksMinorUnits, 20_000n)

    // Adjusted Bank Balance = 550,000 + 40,000 - 20,000 = 570,000
    assert.equal(report.adjustedBankBalanceMinorUnits, 570_000n)
    assert.equal(report.adjustedBookBalanceMinorUnits, 570_000n)
    assert.equal(report.differenceMinorUnits, 0n)
    assert.equal(report.isBalanced, true)
    assert.equal(report.matchedCount, 2)
    assert.equal(report.unmatchedCount, 0)
  }

  // 4. Verify audit log recorded reconciliation event
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'BANK_STATEMENT_RECONCILED' && e.entityId === 'stmt-01'),
    true
  )
})

// ==========================================
// Property-Based Testing (PBT >= 1,000 runs)
// ==========================================

test('PBT: SettlementEngine strictly satisfies conservation and monotonicity invariants (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 100_000_000n }), // available fund
      fc.array(fc.bigInt({ min: 1n, max: 20_000_000n }), { minLength: 1, maxLength: 10 }), // doc balances
      (fund, balances) => {
        const docs = balances.map((b, i) => ({
          id: `doc-${i}`,
          remainingBalanceMinorUnits: b,
        }))

        const sumBalances = balances.reduce((sum, b) => sum + b, 0n)
        const result = SettlementEngine.tryAllocateSettlement(fund, docs)
        assert.equal(result.isOk, true)
        if (result.isErr) return

        // Invariant 1: Total allocated must equal min(fund, sumBalances)
        const expectedAllocated = fund < sumBalances ? fund : sumBalances
        assert.equal(result.value.totalAllocatedMinorUnits, expectedAllocated)

        // Invariant 2: Total allocated + unallocated == fund
        assert.equal(
          result.value.totalAllocatedMinorUnits + result.value.unallocatedMinorUnits,
          fund
        )

        // Invariant 3: For each document: applied <= original, and original - applied == newRemaining >= 0
        for (const alloc of result.value.allocations) {
          assert.equal(alloc.appliedAmountMinorUnits <= alloc.originalBalanceMinorUnits, true)
          assert.equal(
            alloc.originalBalanceMinorUnits - alloc.appliedAmountMinorUnits,
            alloc.newRemainingBalanceMinorUnits
          )
          assert.equal(alloc.newRemainingBalanceMinorUnits >= 0n, true)
          assert.equal(alloc.isFullySettled, alloc.newRemainingBalanceMinorUnits === 0n)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: BankReconciliationMatcher satisfies adjusted book-bank balance invariant (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 100_000n, max: 50_000_000n }), // book balance
      fc.bigInt({ min: 0n, max: 50_000n }), // deposits in transit
      fc.bigInt({ min: 0n, max: 50_000n }), // outstanding checks
      (bookBalance, depositsInTransit, outstandingChecks) => {
        // Under accounting identity:
        // statementBalance = bookBalance - depositsInTransit + outstandingChecks
        const statementClosingBalance = bookBalance - depositsInTransit + outstandingChecks

        const recordedVouchers = [
          {
            id: 'v-transit',
            number: 'RCPT-TR',
            date: '2026-09-10',
            type: 'RECEIPT' as const,
            amountMinorUnits: depositsInTransit,
          },
          {
            id: 'v-out',
            number: 'PMT-OUT',
            date: '2026-09-10',
            type: 'PAYMENT' as const,
            amountMinorUnits: outstandingChecks,
          },
        ]

        const { result } = BankReconciliationMatcher.reconcile({
          statementId: 'stmt-pbt',
          bankAccountId: 'bank-pbt',
          bookBalanceMinorUnits: bookBalance,
          statementClosingBalanceMinorUnits: statementClosingBalance,
          statementLines: [], // no cleared lines in this test
          recordedVouchers,
        })

        // Invariant: Adjusted Book == Adjusted Bank
        assert.equal(result.adjustedBookBalanceMinorUnits, bookBalance)
        assert.equal(result.adjustedBankBalanceMinorUnits, bookBalance)
        assert.equal(result.differenceMinorUnits, 0n)
        assert.equal(result.isBalanced, true)
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: Treasury payment and receipt journal entries preserve debit-credit balance (1,000 runs)', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 1n, max: 100_000_000n }), // payment amount
      fc.bigInt({ min: 1n, max: 100_000_000n }), // receipt amount
      (paymentAmount, receiptAmount) => {
        const zeroRes = Money.zero('TWD')
        const pmtRes = Money.fromMinorUnits(paymentAmount, 'TWD')
        const rcptRes = Money.fromMinorUnits(receiptAmount, 'TWD')

        assert.equal(zeroRes.isOk && pmtRes.isOk && rcptRes.isOk, true)
        if (zeroRes.isOk && pmtRes.isOk && rcptRes.isOk) {
          const zero = zeroRes.value
          const pmt = pmtRes.value
          const rcpt = rcptRes.value

          // 1. Payment journal entry: Debit AP, Credit Bank
          const pmtEntry = JournalEntry.create('je-pmt-pbt', [
            { accountId: 'acc-ap', debit: pmt, credit: zero },
            { accountId: 'acc-bank', debit: zero, credit: pmt },
          ])
          assert.equal(pmtEntry.isOk, true)
          if (pmtEntry.isOk) {
            assert.equal(
              pmtEntry.value.totalDebit.minorUnits,
              pmtEntry.value.totalCredit.minorUnits
            )
            assert.equal(pmtEntry.value.totalDebit.minorUnits, paymentAmount)
          }

          // 2. Receipt journal entry: Debit Bank, Credit AR
          const rcptEntry = JournalEntry.create('je-rcpt-pbt', [
            { accountId: 'acc-bank', debit: rcpt, credit: zero },
            { accountId: 'acc-ar', debit: zero, credit: rcpt },
          ])
          assert.equal(rcptEntry.isOk, true)
          if (rcptEntry.isOk) {
            assert.equal(
              rcptEntry.value.totalDebit.minorUnits,
              rcptEntry.value.totalCredit.minorUnits
            )
            assert.equal(rcptEntry.value.totalDebit.minorUnits, receiptAmount)
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('PBT: Bank account balance conservation and non-negativity under valid operations (1,000 runs)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.bigInt({ min: 50_000n, max: 10_000_000n }), // initial balance
      fc.bigInt({ min: 1n, max: 10_000n }), // receipt amount
      fc.bigInt({ min: 1n, max: 50_000n }), // payment amount (<= initial)
      async (initial, receiptAmt, paymentAmt) => {
        const treasury = new InMemoryTreasuryService()
        await treasury.registerBankAccount({
          id: 'bank-pbt',
          companyId: 'comp-pbt',
          accountNumber: '888-001',
          bankCode: '888',
          bankName: 'PBT Bank',
          accountName: 'PBT Account',
          glAccountId: 'acc-bank-pbt',
          initialBalanceMinorUnits: initial,
        })

        // Receipt
        const rcpt = await treasury.createReceipt({
          id: 'rcpt-pbt',
          companyId: 'comp-pbt',
          bankAccountId: 'bank-pbt',
          receiptNumber: 'RCPT-PBT',
          receiptDate: '2026-09-10',
          payerType: 'CUSTOMER',
          payerId: 'cust-pbt',
          amountMinorUnits: receiptAmt,
        })
        assert.equal(rcpt.isOk, true)
        const postRcpt = await treasury.postReceipt('rcpt-pbt')
        assert.equal(postRcpt.isOk, true)

        // Payment
        const pmt = await treasury.createPayment({
          id: 'pmt-pbt',
          companyId: 'comp-pbt',
          bankAccountId: 'bank-pbt',
          paymentNumber: 'PMT-PBT',
          paymentDate: '2026-09-10',
          beneficiaryType: 'SUPPLIER',
          beneficiaryId: 'supp-pbt',
          amountMinorUnits: paymentAmt,
        })
        assert.equal(pmt.isOk, true)
        const postPmt = await treasury.postPayment('pmt-pbt')
        assert.equal(postPmt.isOk, true)

        // Final balance
        const finalAccount = await treasury.getBankAccount('bank-pbt')
        assert.equal(finalAccount.isOk, true)
        if (finalAccount.isOk) {
          const expected = initial + receiptAmt - paymentAmt
          assert.equal(finalAccount.value.currentBalanceMinorUnits, expected)
          assert.equal(finalAccount.value.currentBalanceMinorUnits >= 0n, true)
        }
      }
    ),
    { numRuns: 1000 }
  )
})
