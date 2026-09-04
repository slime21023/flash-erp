import assert from 'node:assert/strict'
import fc from 'fast-check'
import {
  ApprovalPipeline,
  DuplicateApprovalError,
  InvalidApprovalStepError,
  PipelineTerminatedError,
  UnauthorizedApproverError,
} from '#platform/workflow/index'
import type { ApprovalStep } from '#platform/workflow/index'
import { test } from '@japa/runner'

type OrderContext = {
  orderId: string
  totalAmount: number
}

test('Terminal pipeline states cannot perform further actions', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<'APPROVED' | 'REJECTED' | 'CANCELLED'>('APPROVED', 'REJECTED', 'CANCELLED'),
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      (terminalStatus, approverId, stepId) => {
        const steps: ApprovalStep<OrderContext>[] = [
          { id: 'step-1', name: 'Manager Review', requiredRole: 'MANAGER' },
        ]

        let pipeline = ApprovalPipeline.create(
          'pipe-001',
          { orderId: 'ord-1', totalAmount: 500 },
          steps
        )

        if (terminalStatus === 'APPROVED') {
          const approved = pipeline.approve('step-1', 'mgr-1', ['MANAGER'])
          assert.equal(approved.isOk, true)
          if (approved.isOk) {
            pipeline = approved.value
          }
        } else if (terminalStatus === 'REJECTED') {
          const rejected = pipeline.reject('step-1', 'mgr-1', ['MANAGER'], 'Price too high')
          assert.equal(rejected.isOk, true)
          if (rejected.isOk) {
            pipeline = rejected.value
          }
        } else {
          const cancelled = pipeline.cancel('Client requested cancellation')
          assert.equal(cancelled.isOk, true)
          if (cancelled.isOk) {
            pipeline = cancelled.value
          }
        }

        assert.equal(pipeline.isTerminal, true)
        assert.equal(pipeline.status, terminalStatus)

        const tryApprove = pipeline.approve(stepId, approverId, ['MANAGER'])
        assert.equal(tryApprove.isErr, true)
        if (tryApprove.isErr) {
          assert.equal(tryApprove.error instanceof PipelineTerminatedError, true)
        }

        const tryReject = pipeline.reject(stepId, approverId, ['MANAGER'], 'Too late')
        assert.equal(tryReject.isErr, true)
        if (tryReject.isErr) {
          assert.equal(tryReject.error instanceof PipelineTerminatedError, true)
        }

        const tryCancel = pipeline.cancel('Already done')
        assert.equal(tryCancel.isErr, true)
        if (tryCancel.isErr) {
          assert.equal(tryCancel.error instanceof PipelineTerminatedError, true)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Sequential multi-step pipeline approves deterministically in order', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 10 }), (stepCount) => {
      const steps: ApprovalStep<OrderContext>[] = Array.from({ length: stepCount }, (_, i) => ({
        id: `step-${i + 1}`,
        name: `Step ${i + 1}`,
        requiredRole: `ROLE_${i + 1}`,
      }))

      let pipeline = ApprovalPipeline.create(
        'pipe-test',
        { orderId: 'ord-1', totalAmount: 1000 },
        steps
      )
      assert.equal(pipeline.status, 'PENDING')

      for (let i = 0; i < stepCount; i += 1) {
        const expectedStepId = `step-${i + 1}`
        const role = `ROLE_${i + 1}`
        assert.equal(pipeline.currentStepId, expectedStepId)

        // Wrong role should fail
        const wrongRoleRes = pipeline.approve(expectedStepId, 'user-x', ['WRONG_ROLE'])
        assert.equal(wrongRoleRes.isErr, true)
        if (wrongRoleRes.isErr) {
          assert.equal(wrongRoleRes.error instanceof UnauthorizedApproverError, true)
        }

        // Wrong step should fail
        const wrongStepRes = pipeline.approve('invalid-step', 'user-y', [role])
        assert.equal(wrongStepRes.isErr, true)
        if (wrongStepRes.isErr) {
          assert.equal(wrongStepRes.error instanceof InvalidApprovalStepError, true)
        }

        // Correct approval advances
        const correctRes = pipeline.approve(expectedStepId, `user-${i + 1}`, [role])
        assert.equal(correctRes.isOk, true)
        if (correctRes.isOk) {
          pipeline = correctRes.value
        }
      }

      assert.equal(pipeline.status, 'APPROVED')
      assert.equal(pipeline.isTerminal, true)
      assert.equal(pipeline.history.length, stepCount)
    }),
    { numRuns: 1000 }
  )
})

test('Conditional step bypass automatically skips inactive steps', () => {
  const steps: ApprovalStep<OrderContext>[] = [
    { id: 'lead', name: 'Team Lead', requiredRole: 'LEAD' },
    {
      id: 'director',
      name: 'Director',
      requiredRole: 'DIRECTOR',
      condition: (ctx) => ctx.totalAmount >= 10_000,
    },
    { id: 'finance', name: 'Finance', requiredRole: 'FINANCE' },
  ]

  // Scenario 1: low amount (5,000) -> Director step bypassed
  const lowPipe = ApprovalPipeline.create(
    'pipe-low',
    { orderId: 'ord-1', totalAmount: 5_000 },
    steps
  )
  const lowLead = lowPipe.approve('lead', 'user-1', ['LEAD'])
  assert.equal(lowLead.isOk, true)
  if (lowLead.isOk) {
    assert.equal(lowLead.value.currentStepId, 'finance')
    const lowFinance = lowLead.value.approve('finance', 'user-2', ['FINANCE'])
    assert.equal(lowFinance.isOk, true)
    if (lowFinance.isOk) {
      assert.equal(lowFinance.value.status, 'APPROVED')
      assert.equal(lowFinance.value.history.length, 2)
    }
  }

  // Scenario 2: high amount (50,000) -> Director step required
  const highPipe = ApprovalPipeline.create(
    'pipe-high',
    { orderId: 'ord-2', totalAmount: 50_000 },
    steps
  )
  const highLead = highPipe.approve('lead', 'user-1', ['LEAD'])
  assert.equal(highLead.isOk, true)
  if (highLead.isOk) {
    assert.equal(highLead.value.currentStepId, 'director')
  }
})

test('Duplicate approval on multi-approval step is rejected with Result.err', () => {
  const steps: ApprovalStep<OrderContext>[] = [
    { id: 'board', name: 'Board of Directors', requiredRole: 'BOARD', minApprovals: 2 },
  ]

  const pipe = ApprovalPipeline.create('pipe-board', { orderId: 'ord-1', totalAmount: 100 }, steps)
  const first = pipe.approve('board', 'member-1', ['BOARD'])
  assert.equal(first.isOk, true)

  if (first.isOk) {
    assert.equal(first.value.status, 'PENDING')
    // Member 1 tries to approve again
    const second = first.value.approve('board', 'member-1', ['BOARD'])
    assert.equal(second.isErr, true)
    if (second.isErr) {
      assert.equal(second.error instanceof DuplicateApprovalError, true)
      assert.equal(second.error.code, 'DUPLICATE_APPROVAL')
    }

    // Member 2 approves -> finishes step
    const member2 = first.value.approve('board', 'member-2', ['BOARD'])
    assert.equal(member2.isOk, true)
    if (member2.isOk) {
      assert.equal(member2.value.status, 'APPROVED')
    }
  }
})
