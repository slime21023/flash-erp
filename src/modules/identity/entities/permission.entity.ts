import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('permissions')
export class PermissionEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  code!: string

  @Column({ type: 'varchar', length: 255 })
  description!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
