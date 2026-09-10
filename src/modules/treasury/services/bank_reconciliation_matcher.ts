import type {
  BankReconciliationResult,
  BankStatementLineSnapshot,
} from '../contracts/treasury_contract.js'

export type ReconcilableVoucher = Readonly<{
  id: string
  number: string
  date: string
  type: 'PAYMENT' | 'RECEIPT'
  amountMinorUnits: bigint
}>

export class BankReconciliationMatcher {
  /**
   * Matches bank statement lines with recorded system vouchers and calculates
   * the Bank Reconciliation Statement.
   */
  static reconcile(params: {
    statementId: string
    bankAccountId: string
    bookBalanceMinorUnits: bigint
    statementClosingBalanceMinorUnits: bigint
    statementLines: readonly BankStatementLineSnapshot[]
    recordedVouchers: readonly ReconcilableVoucher[]
  }): {
    result: BankReconciliationResult
    updatedLines: readonly BankStatementLineSnapshot[]
  } {
    const {
      statementId,
      bankAccountId,
      bookBalanceMinorUnits,
      statementClosingBalanceMinorUnits,
      statementLines,
      recordedVouchers,
    } = params

    const matchedVoucherIds = new Set<string>()
    const updatedLines: BankStatementLineSnapshot[] = []
    const matchedLineIds: string[] = []
    const unmatchedLineIds: string[] = []

    for (const line of statementLines) {
      if (line.isMatched && line.matchedVoucherId) {
        matchedVoucherIds.add(line.matchedVoucherId)
        matchedLineIds.push(line.id)
        updatedLines.push(line)
        continue
      }

      // Find eligible voucher: amount match and direction match
      // DEBIT on bank statement = outflow = PAYMENT voucher in system
      // CREDIT on bank statement = inflow = RECEIPT voucher in system
      const expectedType = line.direction === 'DEBIT' ? 'PAYMENT' : 'RECEIPT'

      const match = recordedVouchers.find((v) => {
        if (matchedVoucherIds.has(v.id)) return false
        if (v.type !== expectedType) return false
        if (v.amountMinorUnits !== line.amountMinorUnits) return false

        // Prefer reference matching if present, otherwise amount & type matches
        if (
          line.reference &&
          (line.reference.includes(v.number) || v.number.includes(line.reference))
        ) {
          return true
        }
        return true
      })

      if (match) {
        matchedVoucherIds.add(match.id)
        matchedLineIds.push(line.id)
        updatedLines.push(
          Object.freeze({
            ...line,
            isMatched: true,
            matchedVoucherId: match.id,
          })
        )
      } else {
        unmatchedLineIds.push(line.id)
        updatedLines.push(
          Object.freeze({
            ...line,
            isMatched: false,
            matchedVoucherId: undefined,
          })
        )
      }
    }

    // Identify unrecorded/unmatched items:
    // 1. Deposits in transit: Receipts recorded in system that haven't cleared the bank statement
    let depositsInTransit = 0n
    // 2. Outstanding checks/payments: Payments recorded in system that haven't cleared the bank statement
    let outstandingChecks = 0n

    for (const v of recordedVouchers) {
      if (!matchedVoucherIds.has(v.id)) {
        if (v.type === 'RECEIPT') {
          depositsInTransit += v.amountMinorUnits
        } else if (v.type === 'PAYMENT') {
          outstandingChecks += v.amountMinorUnits
        }
      }
    }

    const adjustedBookBalance = bookBalanceMinorUnits
    const adjustedBankBalance =
      statementClosingBalanceMinorUnits + depositsInTransit - outstandingChecks
    const difference = adjustedBookBalance - adjustedBankBalance
    const isBalanced = difference === 0n

    const result: BankReconciliationResult = Object.freeze({
      statementId,
      bankAccountId,
      bookBalanceMinorUnits,
      bankStatementBalanceMinorUnits: statementClosingBalanceMinorUnits,
      depositsInTransitMinorUnits: depositsInTransit,
      outstandingChecksMinorUnits: outstandingChecks,
      adjustedBookBalanceMinorUnits: adjustedBookBalance,
      adjustedBankBalanceMinorUnits: adjustedBankBalance,
      differenceMinorUnits: difference,
      isBalanced,
      matchedCount: matchedLineIds.length,
      unmatchedCount: unmatchedLineIds.length,
      matchedLineIds: Object.freeze(matchedLineIds),
      unmatchedLineIds: Object.freeze(unmatchedLineIds),
    })

    return { result, updatedLines: Object.freeze(updatedLines) }
  }
}
