import assert from 'node:assert/strict'
import { test } from 'vitest'
import { InMemoryTransactionManager } from '@platform/persistence/index.js'
import { ok, err, DomainError } from '@platform/fp/index.js'

class CustomTransactionError extends DomainError {
  readonly code = 'TX_FAIL'
  constructor(message = 'Transaction failed') {
    super(message)
  }
}

test('InMemoryTransactionManager commits on Result.ok', async () => {
  const tm = new InMemoryTransactionManager()
  assert.equal(tm.runsCount, 0)
  assert.equal(tm.commitsCount, 0)
  assert.equal(tm.rollbacksCount, 0)

  const result = await tm.run(async (client) => {
    assert.equal(typeof client, 'object')
    return ok({ saved: true })
  })

  assert.equal(result.isOk, true)
  assert.equal(tm.runsCount, 1)
  assert.equal(tm.commitsCount, 1)
  assert.equal(tm.rollbacksCount, 0)
})

test('InMemoryTransactionManager rolls back on Result.err', async () => {
  const tm = new InMemoryTransactionManager()

  const result = await tm.run(async (_client) => {
    return err(new CustomTransactionError('Rollback required'))
  })

  assert.equal(result.isErr, true)
  assert.equal(tm.runsCount, 1)
  assert.equal(tm.commitsCount, 0)
  assert.equal(tm.rollbacksCount, 1)
})

test('runInTransaction reuses existing options.client without starting a new transaction', async () => {
  const { runInTransaction } = await import('@platform/persistence/index.js')
  const mockExistingClient = { tag: 'existing-client' } as any
  let receivedClient: any = null

  const result = await runInTransaction(
    {} as any,
    { client: mockExistingClient },
    async (client) => {
      receivedClient = client
      return ok('done')
    }
  )

  assert.equal(result.isOk, true)
  assert.equal(receivedClient, mockExistingClient)
})

test('runInTransaction starts transaction, commits on Result.ok and releases runner', async () => {
  const { runInTransaction } = await import('@platform/persistence/index.js')
  let connected = false
  let started = false
  let committed = false
  let rolledBack = false
  let released = false

  const mockQueryRunner = {
    manager: { tag: 'trx-manager' } as any,
    connect: async () => {
      connected = true
    },
    startTransaction: async () => {
      started = true
    },
    commitTransaction: async () => {
      committed = true
    },
    rollbackTransaction: async () => {
      rolledBack = true
    },
    release: async () => {
      released = true
    },
  }

  const mockManager = {
    connection: {
      createQueryRunner: () => mockQueryRunner,
    },
  } as any

  const result = await runInTransaction(mockManager, undefined, async (client) => {
    assert.equal(client, mockQueryRunner.manager)
    return ok({ created: true })
  })

  assert.equal(result.isOk, true)
  assert.equal(connected, true)
  assert.equal(started, true)
  assert.equal(committed, true)
  assert.equal(rolledBack, false)
  assert.equal(released, true)
})

test('runInTransaction starts transaction, rolls back on Result.err and releases runner', async () => {
  const { runInTransaction } = await import('@platform/persistence/index.js')
  let committed = false
  let rolledBack = false
  let released = false

  const mockQueryRunner = {
    manager: { tag: 'trx-manager' } as any,
    connect: async () => {},
    startTransaction: async () => {},
    commitTransaction: async () => {
      committed = true
    },
    rollbackTransaction: async () => {
      rolledBack = true
    },
    release: async () => {
      released = true
    },
  }

  const mockManager = {
    connection: {
      createQueryRunner: () => mockQueryRunner,
    },
  } as any

  const result = await runInTransaction(mockManager, undefined, async () => {
    return err(new CustomTransactionError('Domain error trigger'))
  })

  assert.equal(result.isErr, true)
  assert.equal(committed, false)
  assert.equal(rolledBack, true)
  assert.equal(released, true)
})

test('runInTransaction rolls back and releases runner when an exception is thrown', async () => {
  const { runInTransaction } = await import('@platform/persistence/index.js')
  let rolledBack = false
  let released = false

  const mockQueryRunner = {
    manager: { tag: 'trx-manager' } as any,
    connect: async () => {},
    startTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {
      rolledBack = true
    },
    release: async () => {
      released = true
    },
  }

  const mockManager = {
    connection: {
      createQueryRunner: () => mockQueryRunner,
    },
  } as any

  await assert.rejects(
    async () => {
      await runInTransaction(mockManager, undefined, async () => {
        throw new Error('Database crash')
      })
    },
    { message: 'Database crash' }
  )

  assert.equal(rolledBack, true)
  assert.equal(released, true)
})

test('runInTransaction falls back gracefully when connection has no createQueryRunner', async () => {
  const { runInTransaction } = await import('@platform/persistence/index.js')
  const mockFallbackManager = { tag: 'simple-manager' } as any

  const result = await runInTransaction(mockFallbackManager, undefined, async (client) => {
    assert.equal(client, mockFallbackManager)
    return ok({ executed: true })
  })

  assert.equal(result.isOk, true)
  if (result.isOk) {
    assert.equal(result.value.executed, true)
  }
})

test('nested runInTransaction propagates client seamlessly without starting child transaction', async () => {
  const { runInTransaction } = await import('@platform/persistence/index.js')
  let childStarted = false

  const mockQueryRunner = {
    manager: { tag: 'parent-trx-manager' } as any,
    connect: async () => {},
    startTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    release: async () => {},
  }

  const mockManager = {
    connection: {
      createQueryRunner: () => mockQueryRunner,
    },
  } as any

  const result = await runInTransaction(mockManager, undefined, async (parentClient) => {
    // Inner call simulating cross-module contract invocation with { client: parentClient }
    return runInTransaction(
      {
        connection: {
          createQueryRunner: () => {
            childStarted = true
            return {} as any
          },
        },
      } as any,
      { client: parentClient },
      async (innerClient) => {
        assert.equal(innerClient, parentClient)
        return ok('nested-ok')
      }
    )
  })

  assert.equal(result.isOk, true)
  assert.equal(childStarted, false)
})
