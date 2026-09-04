import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { Result } from '#platform/fp/index'

export type TransactionClient = TransactionClientContract

export type TransactionOptions = Readonly<{
  client?: TransactionClient
}>

export abstract class TransactionManager {
  abstract run<T, E>(
    work: (client: TransactionClient) => Promise<Result<T, E>>
  ): Promise<Result<T, E>>
}
