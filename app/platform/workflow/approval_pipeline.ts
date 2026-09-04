import { DomainError, err, ok } from '#platform/fp/index'
import type { Result } from '#platform/fp/index'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type ApprovalDecision = 'APPROVED' | 'REJECTED'

export type ApprovalRecord = Readonly<{
  stepId: string
  approverId: string
  role: string
  decision: ApprovalDecision
  comment?: string
  decidedAt: string
}>

export type ApprovalStep<TContext> = Readonly<{
  id: string
  name: string
  requiredRole: string
  minApprovals?: number
  condition?: (context: TContext) => boolean
}>

export abstract class ApprovalError extends DomainError {}

export class PipelineTerminatedError extends ApprovalError {
  readonly code = 'PIPELINE_TERMINATED'

  constructor(readonly status: ApprovalStatus) {
    super(`Cannot perform approval action while pipeline is ${status}`)
  }
}

export class InvalidApprovalStepError extends ApprovalError {
  readonly code = 'INVALID_APPROVAL_STEP'

  constructor(
    readonly requestedStepId: string,
    readonly currentStepId: string | null
  ) {
    super(`Step ${requestedStepId} is not active (current active step: ${currentStepId ?? 'none'})`)
  }
}

export class UnauthorizedApproverError extends ApprovalError {
  readonly code = 'UNAUTHORIZED_APPROVER'

  constructor(
    readonly approverId: string,
    readonly requiredRole: string
  ) {
    super(`Approver ${approverId} does not have the required role ${requiredRole}`)
  }
}

export class DuplicateApprovalError extends ApprovalError {
  readonly code = 'DUPLICATE_APPROVAL'

  constructor(
    readonly approverId: string,
    readonly stepId: string
  ) {
    super(`Approver ${approverId} has already approved step ${stepId}`)
  }
}

export class ApprovalPipeline<TContext = unknown> {
  readonly #id: string
  readonly #context: TContext
  readonly #steps: readonly ApprovalStep<TContext>[]
  readonly #currentStepIndex: number
  readonly #status: ApprovalStatus
  readonly #history: readonly ApprovalRecord[]

  private constructor(
    id: string,
    context: TContext,
    steps: readonly ApprovalStep<TContext>[],
    currentStepIndex: number,
    status: ApprovalStatus,
    history: readonly ApprovalRecord[]
  ) {
    this.#id = id
    this.#context = context
    this.#steps = Object.freeze([...steps])
    this.#currentStepIndex = currentStepIndex
    this.#status = status
    this.#history = Object.freeze([...history])
    Object.freeze(this)
  }

  static create<TContext>(
    id: string,
    context: TContext,
    steps: readonly ApprovalStep<TContext>[]
  ): ApprovalPipeline<TContext> {
    if (steps.length === 0) {
      return new ApprovalPipeline(id, context, [], 0, 'APPROVED', [])
    }

    const firstActiveIndex = ApprovalPipeline.findNextActiveIndex(steps, context, 0)
    if (firstActiveIndex === -1) {
      // All steps bypassed by condition
      return new ApprovalPipeline(id, context, steps, steps.length, 'APPROVED', [])
    }

    return new ApprovalPipeline(id, context, steps, firstActiveIndex, 'PENDING', [])
  }

  get id(): string {
    return this.#id
  }

  get context(): TContext {
    return this.#context
  }

  get status(): ApprovalStatus {
    return this.#status
  }

  get isTerminal(): boolean {
    return this.#status !== 'PENDING'
  }

  get currentStep(): ApprovalStep<TContext> | null {
    if (this.isTerminal || this.#currentStepIndex >= this.#steps.length) {
      return null
    }

    return this.#steps[this.#currentStepIndex] ?? null
  }

  get currentStepId(): string | null {
    return this.currentStep?.id ?? null
  }

  get history(): readonly ApprovalRecord[] {
    return this.#history
  }

  canApprove(approverRoles: readonly string[]): boolean {
    if (this.isTerminal) return false
    const step = this.currentStep
    if (!step) return false
    return approverRoles.includes(step.requiredRole)
  }

  approve(
    stepId: string,
    approverId: string,
    approverRoles: readonly string[],
    comment?: string
  ): Result<ApprovalPipeline<TContext>, ApprovalError> {
    if (this.isTerminal) {
      return err(new PipelineTerminatedError(this.#status))
    }

    const step = this.currentStep
    if (!step || step.id !== stepId) {
      return err(new InvalidApprovalStepError(stepId, this.currentStepId))
    }

    if (!approverRoles.includes(step.requiredRole)) {
      return err(new UnauthorizedApproverError(approverId, step.requiredRole))
    }

    const alreadyApproved = this.#history.some(
      (record) =>
        record.stepId === step.id &&
        record.approverId === approverId &&
        record.decision === 'APPROVED'
    )
    if (alreadyApproved) {
      return err(new DuplicateApprovalError(approverId, step.id))
    }

    const newRecord: ApprovalRecord = {
      stepId: step.id,
      approverId,
      role: step.requiredRole,
      decision: 'APPROVED',
      decidedAt: new Date().toISOString(),
      ...(comment ? { comment } : {}),
    }

    const updatedHistory = [...this.#history, newRecord]
    const requiredMin = step.minApprovals ?? 1
    const currentStepApprovals = updatedHistory.filter(
      (rec) => rec.stepId === step.id && rec.decision === 'APPROVED'
    ).length

    if (currentStepApprovals < requiredMin) {
      return ok(
        new ApprovalPipeline(
          this.#id,
          this.#context,
          this.#steps,
          this.#currentStepIndex,
          'PENDING',
          updatedHistory
        )
      )
    }

    const nextIndex = ApprovalPipeline.findNextActiveIndex(
      this.#steps,
      this.#context,
      this.#currentStepIndex + 1
    )

    if (nextIndex === -1) {
      return ok(
        new ApprovalPipeline(
          this.#id,
          this.#context,
          this.#steps,
          this.#steps.length,
          'APPROVED',
          updatedHistory
        )
      )
    }

    return ok(
      new ApprovalPipeline(
        this.#id,
        this.#context,
        this.#steps,
        nextIndex,
        'PENDING',
        updatedHistory
      )
    )
  }

  reject(
    stepId: string,
    approverId: string,
    approverRoles: readonly string[],
    comment?: string
  ): Result<ApprovalPipeline<TContext>, ApprovalError> {
    if (this.isTerminal) {
      return err(new PipelineTerminatedError(this.#status))
    }

    const step = this.currentStep
    if (!step || step.id !== stepId) {
      return err(new InvalidApprovalStepError(stepId, this.currentStepId))
    }

    if (!approverRoles.includes(step.requiredRole)) {
      return err(new UnauthorizedApproverError(approverId, step.requiredRole))
    }

    const newRecord: ApprovalRecord = {
      stepId: step.id,
      approverId,
      role: step.requiredRole,
      decision: 'REJECTED',
      decidedAt: new Date().toISOString(),
      ...(comment ? { comment } : {}),
    }

    return ok(
      new ApprovalPipeline(
        this.#id,
        this.#context,
        this.#steps,
        this.#currentStepIndex,
        'REJECTED',
        [...this.#history, newRecord]
      )
    )
  }

  cancel(_reason?: string): Result<ApprovalPipeline<TContext>, ApprovalError> {
    if (this.isTerminal) {
      return err(new PipelineTerminatedError(this.#status))
    }

    return ok(
      new ApprovalPipeline(
        this.#id,
        this.#context,
        this.#steps,
        this.#currentStepIndex,
        'CANCELLED',
        this.#history
      )
    )
  }

  private static findNextActiveIndex<TContext>(
    steps: readonly ApprovalStep<TContext>[],
    context: TContext,
    startIndex: number
  ): number {
    for (let index = startIndex; index < steps.length; index += 1) {
      const candidate = steps[index]
      if (!candidate) continue
      if (!candidate.condition || candidate.condition(context)) {
        return index
      }
    }
    return -1
  }
}
