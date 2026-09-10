import type { EntityManager } from 'typeorm'
import type { Result } from '../fp/index.js'

export type TransactionClient = EntityManager

export type TransactionOptions = Readonly<{
  client?: TransactionClient
}>

export abstract class TransactionManager {
  abstract run<T, E>(
    work: (client: TransactionClient) => Promise<Result<T, E>>
  ): Promise<Result<T, E>>
}

export async function runInTransaction<T, E>(
  fallbackManager: EntityManager,
  options: TransactionOptions | undefined,
  work: (client: TransactionClient) => Promise<Result<T, E>>
): Promise<Result<T, E>> {
  if (options?.client) {
    return work(options.client)
  }

  // Graceful fallback for test doubles or environments without a real connection/queryRunner
  if (
    !fallbackManager ||
    !fallbackManager.connection ||
    typeof fallbackManager.connection.createQueryRunner !== 'function'
  ) {
    return work(fallbackManager)
  }

  const queryRunner = fallbackManager.connection.createQueryRunner()
  await queryRunner.connect()
  await queryRunner.startTransaction()

  try {
    const result = await work(queryRunner.manager)
    if (result.isErr) {
      await queryRunner.rollbackTransaction()
    } else {
      await queryRunner.commitTransaction()
    }
    return result
  } catch (error) {
    await queryRunner.rollbackTransaction()
    throw error
  } finally {
    await queryRunner.release()
  }
}
