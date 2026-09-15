import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('outbox_events')
@Index('idx_outbox_pending', ['publishedAt', 'availableAt'])
export class OutboxEventEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ name: 'event_name', type: 'varchar', length: 160 })
  eventName!: string

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  availableAt!: Date

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null

  @Column({ name: 'dead_lettered_at', type: 'timestamptz', nullable: true })
  deadLetteredAt!: Date | null
}
