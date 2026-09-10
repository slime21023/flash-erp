import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, LessThanOrEqual, Repository } from 'typeorm'
import type { EntityManager } from 'typeorm'
import { err, ok } from '../fp/index.js'
import { DomainError } from '../fp/index.js'
import type { Result } from '../fp/index.js'
import type { TransactionOptions } from './transaction.js'
import { OutboxEventEntity } from './outbox_event.entity.js'

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
      await manager.save(
        manager.create(OutboxEventEntity, {
          id: randomUUID(),
          eventName,
          payload: jsonSafe(payload),
          availableAt: new Date(),
          publishedAt: null,
          attempts: 0,
          lastError: null,
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
      const events = await this.repository.find({
        where: { publishedAt: IsNull(), availableAt: LessThanOrEqual(new Date()) },
        order: { occurredAt: 'ASC' },
        take: 50,
      })
      for (const event of events) {
        try {
          await this.emitter.emitAsync(event.eventName, event.payload)
          event.publishedAt = new Date()
          event.lastError = null
        } catch (error) {
          event.attempts += 1
          event.availableAt = new Date(Date.now() + Math.min(60_000, 2 ** event.attempts * 1000))
          event.lastError = error instanceof Error ? error.message.slice(0, 1000) : String(error)
        }
        await this.repository.save(event)
      }
    } finally {
      this.running = false
    }
  }
}
