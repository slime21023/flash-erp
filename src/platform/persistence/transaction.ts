import type { EntityManager } from 'typeorm'
import type { Result } from '../fp/index.js'
import type { RequestScope } from '@platform/context/index.js'
import { currentEventMetadata, runWithRequestContext } from '@platform/context/index.js'

export type TransactionClient = EntityManager

export type TransactionOptions = Readonly<{
  client?: TransactionClient
  scope?: RequestScope
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
    return runWithScope(options, () => work(options.client!))
  }

  // Graceful fallback for test doubles or environments without a real connection/queryRunner
  if (
    !fallbackManager ||
    !fallbackManager.connection ||
    typeof fallbackManager.connection.createQueryRunner !== 'function'
  ) {
    return runWithScope(options, () => work(fallbackManager))
  }

  const queryRunner = fallbackManager.connection.createQueryRunner()
  await queryRunner.connect()
  await queryRunner.startTransaction()

  try {
    const result = await runWithScope(options, () => work(queryRunner.manager))
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

function runWithScope<T>(options: TransactionOptions | undefined, work: () => T): T {
  const organizationUnitId = options?.scope?.organizationUnitId?.trim()
  if (!organizationUnitId) return work()
  return runWithRequestContext({ ...currentEventMetadata(), organizationUnitId }, work)
}
