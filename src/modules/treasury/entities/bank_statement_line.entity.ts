import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import type { BankStatementEntity } from './bank_statement.entity.js'

@Entity('bank_statement_lines')
export class BankStatementLineEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  bankStatementId!: string

  @Column('varchar', { length: 32 })
  transactionDate!: string

  @Column('varchar', { length: 16 })
  direction!: 'DEBIT' | 'CREDIT'

  @Column('varchar', { length: 64 })
  amountMinorUnits!: string

  @Column('varchar', { length: 128 })
  reference!: string

  @Column('text', { nullable: true })
  description?: string

  @Column('boolean', { default: false })
  isMatched!: boolean

  @Column('varchar', { length: 64, nullable: true })
  matchedVoucherId?: string

  @ManyToOne('BankStatementEntity', (stmt: BankStatementEntity) => stmt.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bankStatementId' })
  bankStatement?: BankStatementEntity
}
