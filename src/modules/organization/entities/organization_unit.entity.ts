import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { OrganizationUnitKind } from '../contracts/organization_contract.js'

@Entity('organization_units')
export class OrganizationUnitEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string

  @Column({ type: 'varchar', length: 160 })
  name!: string

  @Column({ type: 'varchar', length: 16 })
  kind!: OrganizationUnitKind

  @Column({ name: 'parent_id', type: 'varchar', length: 64, nullable: true })
  parentId!: string | null

  @ManyToOne(() => OrganizationUnitEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id' })
  parent?: OrganizationUnitEntity | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
