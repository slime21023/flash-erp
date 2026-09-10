import { Money } from '@platform/kernel/index.js'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import { ManufacturingError } from '../contracts/manufacturing_errors.js'

export type AllocationTarget = Readonly<{
  workOrderId: string
  weight: bigint
}>

export type TargetAllocationResult = Readonly<{
  workOrderId: string
  allocatedAmountMinorUnits: bigint
}>

export class OverheadAllocationError extends ManufacturingError {
  readonly code = 'OVERHEAD_ALLOCATION_ERROR'
}

export class OverheadAllocationEngine {
  static tryAllocate(params: {
    totalPoolAmountMinorUnits: bigint
    currency?: string
    targets: readonly AllocationTarget[]
  }): Result<TargetAllocationResult[], OverheadAllocationError> {
    const { totalPoolAmountMinorUnits, targets } = params
    const currency = params.currency || 'TWD'
    if (targets.length === 0) return ok([])
    if (totalPoolAmountMinorUnits <= 0n) {
      return ok(targets.map((t) => ({ workOrderId: t.workOrderId, allocatedAmountMinorUnits: 0n })))
    }

    const totalWeight = targets.reduce((sum, t) => sum + t.weight, 0n)
    const weights = totalWeight === 0n ? targets.map(() => 1n) : targets.map((t) => t.weight)
    const poolMoney = Money.fromMinorUnits(totalPoolAmountMinorUnits, currency)
    if (poolMoney.isErr) return err(new OverheadAllocationError(poolMoney.error.message))

    const allocResult = poolMoney.value.allocate(weights)
    if (allocResult.isErr) return err(new OverheadAllocationError(allocResult.error.message))
    return ok(
      targets.map((t, idx) => ({
        workOrderId: t.workOrderId,
        allocatedAmountMinorUnits: allocResult.value[idx]?.minorUnits ?? 0n,
      }))
    )
  }

  /**
   * Allocates a pool of overhead cost across work orders based on their weights
   * (e.g. completed quantity or direct material cost) with zero remainder loss.
   */
  static allocate(params: {
    totalPoolAmountMinorUnits: bigint
    currency?: string
    targets: readonly AllocationTarget[]
  }): TargetAllocationResult[] {
    const result = OverheadAllocationEngine.tryAllocate(params)
    if (result.isErr) throw new Error(result.error.message)
    return result.value
  }
}
