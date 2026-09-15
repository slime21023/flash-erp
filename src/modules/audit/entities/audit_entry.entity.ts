import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('audit_entries')
@Index('uq_audit_entries_event_id', ['eventId'], { unique: true, where: 'event_id IS NOT NULL' })
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

  @Column({ name: 'event_id', type: 'varchar', length: 128, nullable: true })
  eventId!: string | null

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date
}
