import assert from 'node:assert/strict'
import fc from 'fast-check'
import {
  ApprovalPipeline,
  DuplicateApprovalError,
  InvalidApprovalStateError,
  type ApprovalStep,
} from '@platform/workflow/index.js'
import { test } from 'vitest'

test('approval snapshots survive JSON roundtrips with equivalent transitions and historical records', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ active: fc.boolean(), minApprovals: fc.integer({ min: 1, max: 3 }) }), {
        maxLength: 5,
      }),
      fc.integer({ min: 0, max: 16 }),
      fc.constantFrom('PENDING', 'REJECTED', 'CANCELLED'),
      fc.string({ maxLength: 80 }),
      fc.date({
        min: new Date('1900-01-01T00:00:00.000Z'),
        max: new Date('2100-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      }),
      (profiles, approvals, terminalAction, comment, historicalDate) => {
        const context = { totalAmount: 12345678901234567890n, inspect: () => true }
        const steps: ApprovalStep<typeof context>[] = profiles.map((profile, index) => ({
          id: `step-${index}`,
          name: `Step ${index}`,
          requiredRole: `ROLE_${index}`,
          minApprovals: profile.minApprovals,
          condition: () => profile.active,
        }))
        let original = ApprovalPipeline.create('persisted-pipeline', context, steps)
        for (let index = 0; index < approvals && !original.isTerminal; index += 1) {
          const step = original.currentStep!
          const result = original.approve(step.id, `user-${index}`, [step.requiredRole], comment)
          assert.ok(result.isOk)
          original = result.value
        }
        if (!original.isTerminal && terminalAction !== 'PENDING') {
          const step = original.currentStep!
          const result =
            terminalAction === 'REJECTED'
              ? original.reject(step.id, 'rejector', [step.requiredRole], comment)
              : original.cancel()
          assert.ok(result.isOk)
          original = result.value
        }

        const saved = JSON.parse(JSON.stringify(original.snapshot))
        for (const record of saved.history) record.decidedAt = historicalDate.toISOString()
        const result = ApprovalPipeline.restore('persisted-pipeline', context, steps, saved)
        assert.ok(result.isOk)
        const restored = result.value
        assert.deepEqual(restored.snapshot, saved)
        assert.equal(restored.status, original.status)
        assert.equal(restored.currentStepId, original.currentStepId)
        assert.equal(restored.context, context)
        assert.deepEqual(Object.keys(saved), ['status', 'currentStepId', 'history'])

        if (!original.isTerminal) {
          const step = original.currentStep!
          const nextOriginal = original.approve(step.id, 'next-approver', [step.requiredRole])
          const nextRestored = restored.approve(step.id, 'next-approver', [step.requiredRole])
          assert.ok(nextOriginal.isOk)
          assert.ok(nextRestored.isOk)
          assert.equal(nextRestored.value.status, nextOriginal.value.status)
          assert.equal(nextRestored.value.currentStepId, nextOriginal.value.currentStepId)
          const withoutTimestamps = (pipeline: ApprovalPipeline<typeof context>) =>
            pipeline.history.map(({ decidedAt: _decidedAt, ...record }) => record)
          assert.deepEqual(
            withoutTimestamps(nextRestored.value),
            withoutTimestamps(nextOriginal.value)
          )

          const prior = restored.history.find((record) => record.stepId === step.id)
          if (prior) {
            const duplicate = restored.approve(step.id, prior.approverId, [step.requiredRole])
            assert.ok(duplicate.isErr)
            assert.ok(duplicate.error instanceof DuplicateApprovalError)
          }
        } else {
          assert.ok(restored.approve('step-0', 'user', ['ROLE_0']).isErr)
          assert.ok(restored.reject('step-0', 'user', ['ROLE_0']).isErr)
          assert.ok(restored.cancel().isErr)
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('restore rejects malformed snapshots and histories that cannot produce the stored state', () => {
  const steps = [{ id: 'board', name: 'Board', requiredRole: 'BOARD', minApprovals: 2 }]
  const first = ApprovalPipeline.create('board-pipeline', {}, steps).approve('board', 'member-1', [
    'BOARD',
  ])
  assert.ok(first.isOk)
  const snapshot = first.value.snapshot
  const record = snapshot.history[0]!
  const { role: _role, ...withoutRole } = record
  const malformed: unknown[] = [
    undefined,
    null,
    [],
    {},
    { ...snapshot, extra: true },
    { status: snapshot.status, currentStepId: snapshot.currentStepId },
    { ...snapshot, status: 'UNKNOWN' },
    { ...snapshot, status: 'APPROVED', currentStepId: null },
    { ...snapshot, status: 'REJECTED', currentStepId: null },
    { ...snapshot, currentStepId: 'later-step' },
    { ...snapshot, currentStepId: null },
    { ...snapshot, history: 'history' },
    { ...snapshot, history: new Array(1) },
    { ...snapshot, history: [undefined] },
    { ...snapshot, history: [withoutRole] },
    { ...snapshot, history: [{ ...record, extra: true }] },
    { ...snapshot, history: [{ ...record, stepId: 'later-step' }] },
    { ...snapshot, history: [{ ...record, role: 'DIRECTOR' }] },
    { ...snapshot, history: [{ ...record, approverId: ' ' }] },
    { ...snapshot, history: [{ ...record, decision: 'CANCELLED' }] },
    { ...snapshot, history: [{ ...record, comment: 42 }] },
    { ...snapshot, history: [{ ...record, decidedAt: 'not-a-date' }] },
    { ...snapshot, history: [{ ...record, decidedAt: '2026-02-30T12:00:00.000Z' }] },
    { ...snapshot, history: [record, record] },
    {
      status: 'REJECTED',
      currentStepId: null,
      history: [
        { ...record, decision: 'REJECTED' },
        { ...record, approverId: 'member-2' },
      ],
    },
    {
      status: 'APPROVED',
      currentStepId: null,
      history: [
        record,
        { ...record, approverId: 'member-2' },
        { ...record, approverId: 'member-3' },
      ],
    },
    {
      status: 'CANCELLED',
      currentStepId: null,
      history: [record, { ...record, approverId: 'member-2' }],
    },
  ]
  for (const saved of malformed) {
    const result = ApprovalPipeline.restore('board-pipeline', {}, steps, saved)
    assert.ok(result.isErr, JSON.stringify(saved))
    assert.ok(result.error instanceof InvalidApprovalStateError)
    assert.equal(result.error.code, 'INVALID_APPROVAL_STATE')
    assert.equal(result.error.message, 'Stored approval state is invalid')
  }

  const skipped = [{ ...steps[0], condition: () => false }]
  assert.ok(ApprovalPipeline.restore('board-pipeline', {}, skipped, snapshot).isErr)
  for (const configuredSteps of [[], skipped]) {
    const completed = ApprovalPipeline.create('empty', {}, configuredSteps)
    const result = ApprovalPipeline.restore('empty', {}, configuredSteps, completed.snapshot)
    assert.ok(result.isOk)
    assert.equal(result.value.status, 'APPROVED')
    assert.ok(
      ApprovalPipeline.restore('empty', {}, configuredSteps, {
        status: 'CANCELLED',
        currentStepId: null,
        history: [],
      }).isErr
    )
  }
})

test('snapshots copy and freeze records while preserving historical timestamps and comments', () => {
  const steps = [{ id: 'board', name: 'Board', requiredRole: 'BOARD', minApprovals: 2 }]
  const initial = ApprovalPipeline.create('board-pipeline', {}, steps)
  const first = initial.approve('board', 'member-1', ['BOARD'], 'Original comment')
  assert.ok(first.isOk)
  const saved = JSON.parse(JSON.stringify(first.value.snapshot))
  saved.history[0].decidedAt = '2001-02-03T04:05:06.007Z'
  saved.history[0].comment = ''
  const result = ApprovalPipeline.restore('board-pipeline', {}, steps, saved)
  assert.ok(result.isOk)
  const restored = result.value
  const before = restored.snapshot
  saved.history[0].comment = 'Changed after restore'
  saved.history[0].decidedAt = '2020-01-01T00:00:00.000Z'
  saved.history.push({ ...saved.history[0], approverId: 'member-2' })
  assert.deepEqual(restored.history[0], {
    ...first.value.history[0],
    comment: '',
    decidedAt: '2001-02-03T04:05:06.007Z',
  })
  assert.equal(restored.history.length, 1)
  assert.equal(initial.history.length, 0)

  const cancelled = restored.cancel()
  const rejected = restored.reject('board', 'rejector', ['BOARD'], 'Historical rejection')
  const approved = restored.approve('board', 'member-2', ['BOARD'])
  assert.ok(cancelled.isOk)
  assert.ok(rejected.isOk)
  assert.ok(approved.isOk)
  for (const pipeline of [first.value, restored, cancelled.value, rejected.value, approved.value]) {
    const snapshot = pipeline.snapshot
    assert.ok(Object.isFrozen(snapshot))
    assert.ok(Object.isFrozen(snapshot.history))
    assert.ok(snapshot.history.every(Object.isFrozen))
    assert.throws(() => Object.assign(snapshot.history[0]!, { comment: 'Mutated' }), TypeError)
    const roundtrip = ApprovalPipeline.restore('board-pipeline', {}, steps, snapshot)
    assert.ok(roundtrip.isOk)
    assert.deepEqual(roundtrip.value.snapshot, snapshot)
  }
  assert.deepEqual(restored.snapshot, before)
  assert.equal(cancelled.value.status, 'CANCELLED')
  assert.notEqual(cancelled.value.history[0], restored.history[0])
})
