import assert from 'node:assert/strict'
import fc from 'fast-check'
import { ORPCError } from '@orpc/server'
import { test } from 'vitest'
import * as v from 'valibot'
import { DomainError, err, ok } from '@platform/fp/index.js'
import { serializeApiValue, unwrapResult } from '@platform/http/result_adapter.js'
import { dateSchema, domainErrors, timestampSchema } from '@platform/http/api_schemas.js'

class BusinessError extends DomainError {
  constructor(readonly code: string) {
    super('Public business error')
  }
}

test('API serialization preserves arbitrary integers and UTC timestamps without mutating the domain', () => {
  fc.assert(
    fc.property(fc.bigInt(), fc.date({ noInvalidDate: true }), (amount, date) => {
      const source = { amount, nested: [{ date, amount }], optional: undefined, empty: null }
      const output = unwrapResult(ok(source))
      assert.equal(BigInt(output.amount), amount)
      assert.equal(output.nested[0].date, date.toISOString())
      assert.equal(output.nested[0].amount, amount.toString())
      assert.equal(source.nested[0].date, date)
      assert.equal(source.amount, amount)
      assert.doesNotThrow(() => JSON.stringify(output))
      assert.deepEqual(JSON.parse(JSON.stringify(output)).empty, null)
    }),
    { numRuns: 1000 }
  )
  assert.equal(serializeApiValue(undefined), undefined)
})

test('calendar schemas accept real dates and reject impossible dates', () => {
  fc.assert(
    fc.property(
      fc.date({
        min: new Date('0001-01-01T00:00:00Z'),
        max: new Date('9999-12-31T23:59:59Z'),
        noInvalidDate: true,
      }),
      (date) => {
        assert.equal(v.safeParse(dateSchema, date.toISOString().slice(0, 10)).success, true)
        assert.equal(v.safeParse(timestampSchema, date.toISOString()).success, true)
      }
    ),
    { numRuns: 1000 }
  )
  for (const date of ['2025-02-29', '2024-02-30', '2026-04-31', '2026-13-01']) {
    assert.equal(v.safeParse(dateSchema, date).success, false)
    assert.equal(v.safeParse(timestampSchema, `${date}T12:00:00Z`).success, false)
  }
  assert.equal(v.safeParse(dateSchema, '2024-02-29').success, true)
})

test('domain errors retain their semantic status and unknown failures stay private', () => {
  for (const [code, status] of Object.entries({
    ORDER_NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    AUTHENTICATION_FAILED: 401,
    UNAUTHORIZED_APPROVER: 403,
    ROLE_FORBIDDEN: 403,
    SCOPE_REQUIRED: 403,
    DUPLICATE_RESOURCE: 409,
    INVALID_APPROVAL_STEP: 409,
    INVALID_INPUT: 422,
    INVALID_APPROVAL_STATE: 500,
  })) {
    assert.deepEqual(domainErrors([code]), { [code]: { status } })
    assert.throws(
      () => unwrapResult(err(new BusinessError(code))),
      (error: unknown) =>
        error instanceof ORPCError && error.code === code && error.status === status
    )
  }
  assert.throws(
    () => unwrapResult(err(new Error('secret database connection string'))),
    (error: unknown) =>
      error instanceof ORPCError &&
      error.status === 500 &&
      !JSON.stringify(error.toJSON()).includes('secret')
  )
  const privateError = Object.assign(new BusinessError('INVALID_INPUT'), {
    details: { passwordHash: 'secret' },
  })
  assert.throws(
    () => unwrapResult(err(privateError)),
    (error: unknown) => error instanceof ORPCError && error.data === undefined
  )
})
