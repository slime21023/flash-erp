import assert from 'node:assert/strict'
import { DomainError, err, ok } from '#platform/fp/index'
import { ResultPresenter } from '#platform/http/index'
import type { PresenterOptions } from '#platform/http/index'
import type { HttpContext } from '@adonisjs/core/http'
import { test } from '@japa/runner'

class NotFoundError extends DomainError {
  readonly code = 'ORDER_NOT_FOUND'

  constructor(message = 'Order not found') {
    super(message)
  }
}

class UnauthorizedError extends DomainError {
  readonly code = 'AUTH_UNAUTHORIZED'

  constructor(message = 'Unauthorized') {
    super(message)
  }
}

class ForbiddenError extends DomainError {
  readonly code = 'ROLE_FORBIDDEN'

  constructor(message = 'Forbidden') {
    super(message)
  }
}

class DuplicateError extends DomainError {
  readonly code = 'DUPLICATE_RESOURCE'

  constructor(message = 'Duplicate resource') {
    super(message)
  }
}

class ValidationError extends DomainError {
  readonly code = 'INVALID_INPUT'

  constructor(message = 'Invalid input') {
    super(message)
  }
}

type PresenterContext = Pick<HttpContext, 'response'>

function createMockContext() {
  let statusCode = 200
  let payload: unknown = null

  const mockResponse = {
    ok(body: unknown) {
      statusCode = 200
      payload = body
      return { statusCode, payload }
    },
    created(body: unknown) {
      statusCode = 201
      payload = body
      return { statusCode, payload }
    },
    noContent() {
      statusCode = 204
      payload = null
      return { statusCode, payload }
    },
    status(code: number) {
      statusCode = code
      return {
        send(body: unknown) {
          payload = body
          return { statusCode, payload }
        },
      }
    },
  }

  return {
    context: { response: mockResponse } as unknown as PresenterContext,
    getStatusCode: () => statusCode,
    getPayload: () => payload,
  }
}

test('ResultPresenter maps Ok results to appropriate HTTP statuses', () => {
  const mock1 = createMockContext()
  ResultPresenter.handle(mock1.context, ok({ id: '123' }))
  assert.equal(mock1.getStatusCode(), 200)
  assert.deepEqual(mock1.getPayload(), { id: '123' })

  const mock2 = createMockContext()
  ResultPresenter.handle(mock2.context, ok({ id: '456' }), { successStatus: 201 })
  assert.equal(mock2.getStatusCode(), 201)

  const mock3 = createMockContext()
  ResultPresenter.handle(mock3.context, ok(null), { successStatus: 204 })
  assert.equal(mock3.getStatusCode(), 204)
})

test('ResultPresenter maps DomainErrors to correct semantic HTTP status codes', () => {
  const notFoundMock = createMockContext()
  ResultPresenter.handle(notFoundMock.context, err(new NotFoundError('Not found')))
  assert.equal(notFoundMock.getStatusCode(), 404)

  const authMock = createMockContext()
  ResultPresenter.handle(authMock.context, err(new UnauthorizedError('No token')))
  assert.equal(authMock.getStatusCode(), 401)

  const forbiddenMock = createMockContext()
  ResultPresenter.handle(forbiddenMock.context, err(new ForbiddenError('No permission')))
  assert.equal(forbiddenMock.getStatusCode(), 403)

  const duplicateMock = createMockContext()
  ResultPresenter.handle(duplicateMock.context, err(new DuplicateError('Exists')))
  assert.equal(duplicateMock.getStatusCode(), 409)

  const validationMock = createMockContext()
  ResultPresenter.handle(validationMock.context, err(new ValidationError('Bad format')))
  assert.equal(validationMock.getStatusCode(), 422)

  const customMock = createMockContext()
  const customOptions: PresenterOptions = { statusOverrides: { INVALID_INPUT: 400 } }
  ResultPresenter.handle(customMock.context, err(new ValidationError('Bad format')), customOptions)
  assert.equal(customMock.getStatusCode(), 400)
})

test('ResultPresenter maps non-DomainError to 500 internal error', () => {
  const mock = createMockContext()
  ResultPresenter.handle(mock.context, err(new Error('Uncaught database crash')))
  assert.equal(mock.getStatusCode(), 500)
  assert.deepEqual(mock.getPayload(), {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  })
})
