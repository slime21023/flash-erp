import db from '@adonisjs/lucid/services/db'
import type { Result } from '#platform/fp/index'
import type { TransactionClient } from './transaction.js'
import { TransactionManager } from './transaction.js'

export class LucidTransactionManager extends TransactionManager {
  async run<T, E>(
    work: (client: TransactionClient) => Promise<Result<T, E>>
  ): Promise<Result<T, E>> {
    return db.transaction(async (transaction) => {
      const result = await work(transaction)
      if (result.isErr) {
        await transaction.rollback()
      }

      return result
    })
  }
}
