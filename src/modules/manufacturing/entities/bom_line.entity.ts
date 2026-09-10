import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import type { BomEntity } from './bom.entity.js'

@Entity('bom_lines')
export class BomLineEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  bomId!: string

  @Column('varchar', { length: 64 })
  componentItemId!: string

  @Column('varchar', { length: 64 })
  quantityPerBase!: string

  @Column('int', { default: 0 })
  scrapPercentageBasisPoints!: number

  @Column('text', { nullable: true })
  memo?: string

  @ManyToOne('BomEntity', (bom: BomEntity) => bom.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bomId' })
  bom?: BomEntity
}
