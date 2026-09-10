import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('local_users')
export class LocalUserEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 96 })
  username!: string

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string

  @Column({ name: 'display_name', type: 'varchar', length: 160 })
  displayName!: string

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
