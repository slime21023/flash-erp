import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm'
import type { BankStatementLineEntity } from './bank_statement_line.entity.js'

@Entity('bank_statements')
export class BankStatementEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  bankAccountId!: string

  @Column('varchar', { length: 64 })
  statementNumber!: string

  @Column('varchar', { length: 32 })
  statementDate!: string

  @Column('varchar', { length: 64 })
  openingBalanceMinorUnits!: string

  @Column('varchar', { length: 64 })
  closingBalanceMinorUnits!: string

  @OneToMany('BankStatementLineEntity', (line: BankStatementLineEntity) => line.bankStatement, {
    cascade: true,
  })
  lines!: BankStatementLineEntity[]
}
