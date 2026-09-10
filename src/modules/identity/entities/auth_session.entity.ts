import { CreateDateColumn, Entity, Index, PrimaryColumn, Column } from 'typeorm'

@Entity('auth_sessions')
export class AuthSessionEntity {
  @PrimaryColumn({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
