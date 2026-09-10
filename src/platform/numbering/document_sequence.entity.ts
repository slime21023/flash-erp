import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('document_sequences')
export class DocumentSequenceEntity {
  @PrimaryColumn({ name: 'sequence_key', type: 'varchar', length: 64 })
  sequenceKey!: string

  @PrimaryColumn({ name: 'period', type: 'varchar', length: 32, default: '' })
  period!: string

  @Column({ name: 'current_seq', type: 'bigint', default: 0 })
  currentSeq!: string | bigint

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
