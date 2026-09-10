import assert from 'node:assert/strict'
import fc from 'fast-check'
import { Result, combine, err, fromAsyncThrowable, fromThrowable, ok } from '@platform/fp/index.js'
import type { Result as ResultType } from '@platform/fp/index.js'
import { test } from 'vitest'

test('Result map preserves successful values', () => {
  fc.assert(
    fc.property(fc.integer(), (value) => {
      const result = ok(value).map((number) => number + 1)
      assert.equal(result.isOk, true)
      if (result.isOk) {
        assert.equal(result.value, value + 1)
      }
    }),
    { numRuns: 1000 }
  )
})

test('Result andThen does not run after an error', () => {
  fc.assert(
    fc.property(fc.string(), (message) => {
      let called = false
      const result = err(new Error(message)).andThen(() => {
        called = true
        return ok('unreachable')
      })

      assert.equal(called, false)
      assert.equal(result.isErr, true)
    }),
    { numRuns: 1000 }
  )
})

test('Result combine preserves all ok values in order or returns the first error', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc
          .boolean()
          .chain((isSuccess) =>
            isSuccess
              ? fc.integer().map((value): ResultType<number, string> => ok(value))
              : fc.string().map((error): ResultType<number, string> => err(error))
          ),
        { minLength: 0, maxLength: 20 }
      ),
      (results) => {
        const combined = combine(results)
        const firstErr = results.find((r) => r.isErr)

        if (firstErr) {
          assert.equal(combined.isErr, true)
          if (combined.isErr) {
            assert.equal(combined.error, firstErr.error)
          }
        } else {
          assert.equal(combined.isOk, true)
          if (combined.isOk) {
            assert.deepEqual(
              combined.value,
              results.map((r) => (r.isOk ? r.value : 0))
            )
          }
        }
      }
    ),
    { numRuns: 1000 }
  )
})

test('Result match exhaustively handles ok and err cases', () => {
  fc.assert(
    fc.property(fc.integer(), fc.string(), fc.boolean(), (value, errorMsg, isSuccess) => {
      const result: ResultType<number, string> = isSuccess ? ok(value) : err(errorMsg)
      const matched = result.match({
        ok: (v) => `OK:${v}`,
        err: (e) => `ERR:${e}`,
      })

      if (isSuccess) {
        assert.equal(matched, `OK:${value}`)
      } else {
        assert.equal(matched, `ERR:${errorMsg}`)
      }
    }),
    { numRuns: 1000 }
  )
})

test('Result fromThrowable and fromAsyncThrowable catch exceptions gracefully', async () => {
  const safeFn = fromThrowable(
    () => JSON.parse('{"status":"ok"}'),
    (error) => (error as Error).message
  )
  assert.equal(safeFn.isOk, true)
  if (safeFn.isOk) {
    assert.deepEqual(safeFn.value, { status: 'ok' })
  }

  const failingFn = fromThrowable(
    () => JSON.parse('{invalid json}'),
    (error) => (error as Error).name
  )
  assert.equal(failingFn.isErr, true)
  if (failingFn.isErr) {
    assert.equal(failingFn.error, 'SyntaxError')
  }

  const asyncSuccess = await fromAsyncThrowable(
    async () => 'async result',
    () => 'error'
  )
  assert.equal(asyncSuccess.isOk, true)

  const asyncFail = await fromAsyncThrowable(
    async () => {
      throw new Error('boom')
    },
    (e) => (e as Error).message
  )
  assert.equal(asyncFail.isErr, true)
  if (asyncFail.isErr) {
    assert.equal(asyncFail.error, 'boom')
  }

  assert.equal(typeof Result.combine, 'function')
})
