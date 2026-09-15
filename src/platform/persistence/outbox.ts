import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { EntityManager } from 'typeorm'
import { err, ok } from '../fp/index.js'
import { DomainError } from '../fp/index.js'
import type { Result } from '../fp/index.js'
import type { TransactionOptions } from './transaction.js'
import { OutboxEventEntity } from './outbox_event.entity.js'
import { currentEventMetadata, runWithRequestContext } from '@platform/context/index.js'
import type { EventMetadata } from '@platform/context/index.js'

export class OutboxPersistenceError extends DomainError {
  readonly code = 'OUTBOX_PERSISTENCE_ERROR'

  constructor() {
    super('Unable to persist domain event')
  }
}

function jsonSafe(value: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) =>
      typeof nested === 'bigint' ? nested.toString() : nested
    )
  ) as Record<string, unknown>
}

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repository: Repository<OutboxEventEntity>
  ) {}

  async enqueue(
    eventName: string,
    payload: unknown,
    options?: TransactionOptions
  ): Promise<Result<void, OutboxPersistenceError>> {
    const manager: EntityManager = options?.client ?? this.repository.manager
    try {
      const eventId = randomUUID()
      await manager.save(
        manager.create(OutboxEventEntity, {
          id: eventId,
          eventName,
          payload: { ...jsonSafe(payload), eventId },
          availableAt: new Date(),
          publishedAt: null,
          attempts: 0,
          lastError: null,
          deadLetteredAt: null,
        })
      )
      return ok(undefined)
    } catch {
      return err(new OutboxPersistenceError())
    }
  }
}

@Injectable()
export class OutboxDispatcher {
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repository: Repository<OutboxEventEntity>,
    private readonly emitter: EventEmitter2
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dispatchPending()
    const interval = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000)
    this.timer = setInterval(
      () => void this.dispatchPending().catch(() => undefined),
      Math.max(250, interval)
    )
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async dispatchPending(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (let dispatched = 0; dispatched < 50; dispatched += 1) {
        const didDispatch = await this.repository.manager.transaction(async (manager) => {
          const event = await manager
            .createQueryBuilder(OutboxEventEntity, 'event')
            .setLock('pessimistic_write')
            .setOnLocked('skip_locked')
            .where('event.published_at IS NULL')
            .andWhere('event.dead_lettered_at IS NULL')
            .andWhere('event.available_at <= :now', { now: new Date() })
            .orderBy('event.occurred_at', 'ASC')
            .getOne()

          if (!event) return false

          try {
            const metadata = event.payload.eventMetadata
            const hasMetadata =
              metadata &&
              typeof metadata === 'object' &&
              typeof (metadata as Record<string, unknown>).actorId === 'string' &&
              typeof (metadata as Record<string, unknown>).requestId === 'string'
            const baseMetadata: EventMetadata = hasMetadata
              ? {
                  actorId: (metadata as Record<string, string>).actorId,
                  requestId: (metadata as Record<string, string>).requestId,
                }
              : currentEventMetadata()
            const eventMetadata: EventMetadata = { ...baseMetadata, eventId: event.id }
            const payload = { ...event.payload, eventMetadata, eventId: event.id }
            event.payload = payload

            await runWithRequestContext(eventMetadata, () =>
              this.emitter.emitAsync(event.eventName, payload)
            )
            event.publishedAt = new Date()
            event.lastError = null
          } catch (error) {
            event.attempts += 1
            const maxAttempts = Math.max(1, Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 20))
            if (event.attempts >= maxAttempts) {
              event.deadLetteredAt = new Date()
            } else {
              event.availableAt = new Date(
                Date.now() + Math.min(60_000, 2 ** event.attempts * 1000)
              )
            }
            event.lastError = error instanceof Error ? error.message.slice(0, 1000) : String(error)
            console.warn(
              JSON.stringify({
                level: 'warn',
                component: 'outbox',
                eventId: event.id,
                eventName: event.eventName,
                attempts: event.attempts,
                deadLettered: Boolean(event.deadLetteredAt),
                message: 'domain event dispatch failed',
              })
            )
          }
          await manager.save(event)
          return true
        })

        if (!didDispatch) break
      }
    } finally {
      this.running = false
    }
  }
}
