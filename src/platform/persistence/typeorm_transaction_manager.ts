import type { DataSource } from 'typeorm'
import { Injectable } from '@nestjs/common'
import type { Result } from '../fp/index.js'
import type { TransactionClient } from './transaction.js'
import { TransactionManager } from './transaction.js'

@Injectable()
export class TypeOrmTransactionManager extends TransactionManager {
  constructor(private readonly dataSource: DataSource) {
    super()
  }

  async run<T, E>(
    work: (client: TransactionClient) => Promise<Result<T, E>>
  ): Promise<Result<T, E>> {
    const queryRunner = this.dataSource.createQueryRunner()
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
}
