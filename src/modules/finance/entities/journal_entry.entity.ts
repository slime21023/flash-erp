import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { JournalEntryLineEntity } from './journal_entry_line.entity.js'

@Entity('journal_entries')
@Index(['companyId', 'number'], { unique: true })
export class JournalEntryEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ name: 'company_id', type: 'varchar', length: 64 })
  companyId!: string

  @Column({ type: 'varchar', length: 64 })
  number!: string

  @Column({ name: 'accounting_date', type: 'date' })
  accountingDate!: string

  @Column({ type: 'varchar', length: 16, default: 'DRAFT' })
  status!: 'DRAFT' | 'POSTED' | 'VOID'

  @Column({ type: 'varchar', length: 3 })
  currency!: string

  @Column({ name: 'total_debit_minor_units', type: 'bigint' })
  totalDebitMinorUnits!: string

  @Column({ name: 'total_credit_minor_units', type: 'bigint' })
  totalCreditMinorUnits!: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  memo!: string | null

  @Column({ name: 'reversal_of_id', type: 'varchar', length: 64, nullable: true })
  reversalOfId!: string | null

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToMany('JournalEntryLineEntity', (line: JournalEntryLineEntity) => line.journalEntry, {
    cascade: true,
  })
  lines!: JournalEntryLineEntity[]
}
