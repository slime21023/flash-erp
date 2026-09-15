import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import { ManufacturingError } from '../contracts/manufacturing_errors.js'
import type { BomLineSnapshot } from '../contracts/manufacturing_contract.js'

export class BomExplosionError extends ManufacturingError {
  readonly code = 'BOM_EXPLOSION_ERROR'
}

export class BomExplosionEngine {
  static tryExplode(params: {
    targetQuantity: bigint
    baseQuantity: bigint
    lines: readonly BomLineSnapshot[]
  }): Result<Array<{ componentItemId: string; plannedQuantity: bigint }>, BomExplosionError> {
    const { targetQuantity, baseQuantity } = params
    if (targetQuantity <= 0n) return err(new BomExplosionError('Target quantity must be positive'))
    if (baseQuantity <= 0n) return err(new BomExplosionError('BOM base quantity must be positive'))
    return ok(BomExplosionEngine.calculate(params))
  }

  /**
   * Calculates planned material requirements given a BOM and target output quantity.
   * Uses ceiling integer division to ensure scrap is accounted for without under-allocating.
   */
  private static calculate({
    targetQuantity,
    baseQuantity,
    lines,
  }: {
    targetQuantity: bigint
    baseQuantity: bigint
    lines: readonly BomLineSnapshot[]
  }): Array<{ componentItemId: string; plannedQuantity: bigint }> {
    return lines.map((line) => {
      const scrapFactor = 10_000n + BigInt(line.scrapPercentageBasisPoints)
      const numerator = targetQuantity * line.quantityPerBase * scrapFactor
      const denominator = baseQuantity * 10_000n

      // Ceiling division: (num + den - 1) / den
      const plannedQuantity = (numerator + denominator - 1n) / denominator

      return {
        componentItemId: line.componentItemId,
        plannedQuantity: plannedQuantity > 0n ? plannedQuantity : 1n,
      }
    })
  }
}
