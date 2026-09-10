import type { Result } from '../fp/index.js'
import type { TransactionClient } from './transaction.js'
import { TransactionManager } from './transaction.js'

export class InMemoryTransactionManager extends TransactionManager {
  #runsCount = 0
  #rollbacksCount = 0
  #commitsCount = 0

  get runsCount(): number {
    return this.#runsCount
  }

  get rollbacksCount(): number {
    return this.#rollbacksCount
  }

  get commitsCount(): number {
    return this.#commitsCount
  }

  async run<T, E>(
    work: (client: TransactionClient) => Promise<Result<T, E>>
  ): Promise<Result<T, E>> {
    this.#runsCount += 1
    const mockClient = {
      isTransaction: true,
    } as unknown as TransactionClient

    const result = await work(mockClient)
    if (result.isErr) {
      this.#rollbacksCount += 1
    } else {
      this.#commitsCount += 1
    }

    return result
  }
}
