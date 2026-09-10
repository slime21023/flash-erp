import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('roles')
export class RoleEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 96 })
  code!: string

  @Column({ type: 'varchar', length: 160 })
  name!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
