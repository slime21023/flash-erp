import { ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import {
  ApprovalPipeline,
  type ApprovalError,
  type ApprovalStep,
} from '@platform/workflow/index.js'
import type { PurchaseOrderSnapshot } from '../contracts/index.js'

type ApprovalContext = Readonly<{ totalAmount: bigint }>

const steps: readonly ApprovalStep<ApprovalContext>[] = [
  { id: 'mgr-review', name: 'Manager Review', requiredRole: 'MANAGER' },
  {
    id: 'director-review',
    name: 'Director Review',
    requiredRole: 'DIRECTOR',
    condition: (context) => context.totalAmount >= 100_000n,
  },
]

type PurchaseOrderApprovalLines = readonly {
  orderedQuantity: bigint | string
  unitCostMinorUnits: bigint | string
}[]

export function createPurchaseOrderPipeline(
  id: string,
  lines: PurchaseOrderApprovalLines
): ApprovalPipeline<ApprovalContext> {
  const context = Object.freeze({
    totalAmount: lines.reduce(
      (sum, line) => sum + BigInt(line.orderedQuantity) * BigInt(line.unitCostMinorUnits),
      0n
    ),
  })
  return ApprovalPipeline.create(id, context, steps)
}

export function purchaseOrderPipeline(
  id: string,
  lines: PurchaseOrderApprovalLines,
  savedState?: unknown
): Result<ApprovalPipeline<ApprovalContext>, ApprovalError> {
  const pipeline = createPurchaseOrderPipeline(id, lines)
  return savedState == null
    ? ok(pipeline)
    : ApprovalPipeline.restore(id, pipeline.context, steps, savedState)
}

export function purchaseOrderApproval(
  pipeline: ApprovalPipeline<ApprovalContext>
): NonNullable<PurchaseOrderSnapshot['approval']> {
  return Object.freeze({
    ...pipeline.snapshot,
    requiredRole: pipeline.currentStep?.requiredRole ?? null,
  })
}
