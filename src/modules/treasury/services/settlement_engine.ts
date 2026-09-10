export type SettlableDocument = Readonly<{
  id: string
  remainingBalanceMinorUnits: bigint
}>

export type SettlementAllocation = Readonly<{
  documentId: string
  originalBalanceMinorUnits: bigint
  appliedAmountMinorUnits: bigint
  newRemainingBalanceMinorUnits: bigint
  isFullySettled: boolean
}>

export type SettlementResult = Readonly<{
  totalAvailableMinorUnits: bigint
  totalAllocatedMinorUnits: bigint
  unallocatedMinorUnits: bigint
  allocations: readonly SettlementAllocation[]
}>

export class SettlementEngine {
  static tryAllocateSettlement(
    totalAvailableMinorUnits: bigint,
    documents: readonly SettlableDocument[]
  ): Result<SettlementResult, SettlementValidationError> {
    if (totalAvailableMinorUnits < 0n) {
      return err(new SettlementValidationError('Total available amount cannot be negative'))
    }
    return ok(SettlementEngine.calculate(totalAvailableMinorUnits, documents))
  }

  /**
   * Allocates available payment/receipt funds across a list of unpaid documents (FIFO).
   * Invariants:
   * 1. Total allocated <= totalAvailable
   * 2. For each doc, applied <= originalBalance
   * 3. originalBalance - applied == newRemainingBalance
   * 4. Total allocated == min(totalAvailable, sum(originalBalances))
   */
  static allocateSettlement(
    totalAvailableMinorUnits: bigint,
    documents: readonly SettlableDocument[]
  ): SettlementResult {
    const result = SettlementEngine.tryAllocateSettlement(totalAvailableMinorUnits, documents)
    if (result.isErr) throw new Error(result.error.message)
    return result.value
  }

  private static calculate(
    totalAvailableMinorUnits: bigint,
    documents: readonly SettlableDocument[]
  ): SettlementResult {
    let remainingFund = totalAvailableMinorUnits
    let totalAllocated = 0n
    const allocations: SettlementAllocation[] = []

    for (const doc of documents) {
      if (doc.remainingBalanceMinorUnits <= 0n) {
        allocations.push({
          documentId: doc.id,
          originalBalanceMinorUnits: doc.remainingBalanceMinorUnits,
          appliedAmountMinorUnits: 0n,
          newRemainingBalanceMinorUnits: doc.remainingBalanceMinorUnits,
          isFullySettled: true,
        })
        continue
      }

      if (remainingFund <= 0n) {
        allocations.push({
          documentId: doc.id,
          originalBalanceMinorUnits: doc.remainingBalanceMinorUnits,
          appliedAmountMinorUnits: 0n,
          newRemainingBalanceMinorUnits: doc.remainingBalanceMinorUnits,
          isFullySettled: false,
        })
        continue
      }

      const applied =
        remainingFund >= doc.remainingBalanceMinorUnits
          ? doc.remainingBalanceMinorUnits
          : remainingFund

      const newRemaining = doc.remainingBalanceMinorUnits - applied
      remainingFund -= applied
      totalAllocated += applied

      allocations.push({
        documentId: doc.id,
        originalBalanceMinorUnits: doc.remainingBalanceMinorUnits,
        appliedAmountMinorUnits: applied,
        newRemainingBalanceMinorUnits: newRemaining,
        isFullySettled: newRemaining === 0n,
      })
    }

    return Object.freeze({
      totalAvailableMinorUnits,
      totalAllocatedMinorUnits: totalAllocated,
      unallocatedMinorUnits: remainingFund,
      allocations: Object.freeze(allocations),
    })
  }
}
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import { DomainError } from '@platform/fp/index.js'

export class SettlementValidationError extends DomainError {
  readonly code = 'SETTLEMENT_VALIDATION_ERROR'

  constructor(message: string) {
    super(message)
  }
}
