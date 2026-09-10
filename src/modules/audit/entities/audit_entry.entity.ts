import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('audit_entries')
export class AuditEntryEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string

  @Column({ name: 'actor_id', type: 'varchar', length: 64, nullable: true })
  actorId!: string | null

  @Column({ type: 'varchar', length: 120 })
  action!: string

  @Column({ name: 'entity_type', type: 'varchar', length: 120 })
  entityType!: string

  @Column({ name: 'entity_id', type: 'varchar', length: 120 })
  entityId!: string

  @Column({ name: 'before_value', type: 'jsonb', nullable: true })
  beforeValue!: Record<string, unknown> | null

  @Column({ name: 'after_value', type: 'jsonb', nullable: true })
  afterValue!: Record<string, unknown> | null

  @Column({ name: 'request_id', type: 'varchar', length: 120, nullable: true })
  requestId!: string | null

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date
}
