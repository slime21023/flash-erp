import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm'
import type { BomLineEntity } from './bom_line.entity.js'

@Entity('boms')
export class BomEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string

  @Column('varchar', { length: 64 })
  companyId!: string

  @Column('varchar', { length: 64 })
  code!: string

  @Column('varchar', { length: 128 })
  name!: string

  @Column('varchar', { length: 64 })
  parentItemId!: string

  @Column('varchar', { length: 64, default: '1' })
  baseQuantity!: string

  @OneToMany('BomLineEntity', (line: BomLineEntity) => line.bom, { cascade: true })
  lines!: BomLineEntity[]
}
