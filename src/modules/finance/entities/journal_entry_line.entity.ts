import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { JournalEntryEntity } from './journal_entry.entity.js'
import { AccountEntity } from './account.entity.js'

@Entity('journal_entry_lines')
@Index(['journalEntryId', 'lineNumber'], { unique: true })
export class JournalEntryLineEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string

  @Column({ name: 'journal_entry_id', type: 'varchar', length: 64 })
  journalEntryId!: string

  @Column({ name: 'account_id', type: 'varchar', length: 64 })
  accountId!: string

  @Column({ name: 'debit_minor_units', type: 'bigint' })
  debitMinorUnits!: string

  @Column({ name: 'credit_minor_units', type: 'bigint' })
  creditMinorUnits!: string

  @Column({ name: 'line_number', type: 'integer' })
  lineNumber!: number

  @Column({ type: 'varchar', length: 255, nullable: true })
  memo!: string | null

  @ManyToOne('JournalEntryEntity', (entry: JournalEntryEntity) => entry.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry?: JournalEntryEntity

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity
}
