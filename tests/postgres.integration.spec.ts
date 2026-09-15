import assert from 'node:assert/strict'
import { afterAll, beforeAll, test } from 'vitest'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DataSource } from 'typeorm'
import { InitialSchema1710000000000 } from '../src/database/migrations/1710000000000_initial_schema.js'
import { FixCamelCaseColumns1710000001000 } from '../src/database/migrations/1710000001000_fix_camel_case_columns.js'
import { HardenSchemaDefaults1710000002000 } from '../src/database/migrations/1710000002000_harden_schema_defaults.js'
import { ProductionHardening1710000003000 } from '../src/database/migrations/1710000003000_production_hardening.js'
import { WorkflowIntegrity1710000004000 } from '../src/database/migrations/1710000004000_workflow_integrity.js'
import { DomainError, err } from '@platform/fp/index.js'
import { OutboxDispatcher, OutboxService } from '@platform/persistence/outbox.js'
import { OutboxEventEntity } from '@platform/persistence/outbox_event.entity.js'
import { runInTransaction } from '@platform/persistence/transaction.js'
import { AuditEntryEntity } from '../src/modules/audit/entities/audit_entry.entity.js'
import { TypeOrmAuditService } from '../src/modules/audit/services/typeorm_audit_service.js'

class IntegrationRollbackError extends DomainError {
  readonly code = 'INTEGRATION_ROLLBACK'

  constructor() {
    super('integration rollback')
  }
}

const testDatabase = process.env.TEST_DB_DATABASE ?? 'flash_erp_test'
const developmentDatabase = process.env.DB_DATABASE ?? 'flash_erp'
if (testDatabase === developmentDatabase) {
  throw new Error('TEST_DB_DATABASE must not be the development DB_DATABASE')
}

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT ?? process.env.DB_PORT ?? 5433),
  username: process.env.TEST_DB_USER ?? process.env.DB_USER ?? 'flash_erp',
  password: process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? 'flash_erp',
  database: testDatabase,
  entities: [OutboxEventEntity, AuditEntryEntity],
  migrations: [
    InitialSchema1710000000000,
    FixCamelCaseColumns1710000001000,
    HardenSchemaDefaults1710000002000,
    ProductionHardening1710000003000,
    WorkflowIntegrity1710000004000,
  ],
  synchronize: false,
})

beforeAll(async () => {
  await dataSource.initialize()
  await dataSource.dropDatabase()
  await dataSource.runMigrations()
})

afterAll(async () => {
  if (dataSource.isInitialized) await dataSource.destroy()
})

test('migrations create the production schema and hardened defaults', async () => {
  const tables = await dataSource.query<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  )
  const tableNames = new Set(tables.map((table) => table.table_name))

  for (const table of [
    'organization_units',
    'inventory_items',
    'sales_orders',
    'journal_entries',
    'audit_entries',
    'outbox_events',
  ]) {
    assert.equal(tableNames.has(table), true, `missing table ${table}`)
  }

  const defaults = await dataSource.query<{ column_default: string | null }[]>(
    `SELECT column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'local_users'
        AND column_name = 'created_at'`
  )
  assert.match(defaults[0]?.column_default ?? '', /CURRENT_TIMESTAMP/i)

  const hardenedColumns = await dataSource.query<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'outbox_events' AND column_name = 'dead_lettered_at')
          OR (table_name = 'audit_entries' AND column_name = 'event_id'))`
  )
  assert.equal(hardenedColumns.length, 2)

  const constraints = await dataSource.query<{ conname: string }[]>(
    `SELECT conname FROM pg_constraint WHERE conname IN
      ('fk_user_scopes_organization_unit', 'fk_inventory_items_company',
       'ck_journal_lines_single_side', 'fk_sales_orders_customer',
       'ck_sales_order_lines_positive_quantity')`
  )
  assert.equal(constraints.length, 5)

  const indexes = await dataSource.query<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('uq_journal_entries_reversal_of_id', 'uq_bank_accounts_company_account_number')`
  )
  assert.equal(indexes.length, 2)
})

test('real TypeORM transaction rolls back Result.err writes', async () => {
  const result = await runInTransaction(dataSource.manager, undefined, async (manager) => {
    await manager.query(
      `INSERT INTO organization_units (id, code, name, kind) VALUES ('rollback-org', 'ROLLBACK', 'Rollback', 'COMPANY')`
    )
    return err(new IntegrationRollbackError())
  })

  assert.equal(result.isErr, true)
  const rows = await dataSource.query<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM organization_units WHERE id = 'rollback-org'`
  )
  assert.equal(rows[0]?.count, '0')
})

test('outbox persists JSON-safe payloads, publishes, retries, and recovers', async () => {
  const repository = dataSource.getRepository(OutboxEventEntity)
  const outbox = new OutboxService(repository)
  const emitter = new EventEmitter2()
  const received: unknown[] = []
  emitter.on('integration.success', (payload: unknown) => received.push(payload))

  const enqueueResult = await outbox.enqueue('integration.success', {
    amount: 42n,
    eventMetadata: { actorId: 'user-integration', requestId: 'req-integration' },
  })
  assert.equal(enqueueResult.isOk, true)

  const dispatcher = new OutboxDispatcher(repository, emitter)
  await dispatcher.onModuleInit()
  dispatcher.onModuleDestroy()

  assert.equal(received.length, 1)
  const receivedPayload = received[0] as {
    amount: string
    eventId: string
    eventMetadata: { actorId: string; requestId: string; eventId: string }
  }
  assert.equal(receivedPayload.amount, '42')
  assert.match(receivedPayload.eventId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(receivedPayload.eventMetadata, {
    actorId: 'user-integration',
    requestId: 'req-integration',
    eventId: receivedPayload.eventId,
  })
  const published = await repository.findOneBy({ eventName: 'integration.success' })
  assert.ok(published?.publishedAt)
  assert.equal(published?.attempts, 0)

  const failure = await outbox.enqueue('integration.retry', { ok: true })
  assert.equal(failure.isOk, true)
  emitter.on('integration.retry', () => {
    throw new Error('temporary listener failure')
  })
  const failingDispatcher = new OutboxDispatcher(repository, emitter)
  await failingDispatcher.onModuleInit()
  failingDispatcher.onModuleDestroy()

  const pending = await repository.findOneBy({ eventName: 'integration.retry' })
  assert.equal(pending?.attempts, 1)
  assert.equal(pending?.publishedAt, null)

  if (!pending) throw new Error('retry event was not persisted')
  pending.availableAt = new Date(0)
  await repository.save(pending)
  const recovered: unknown[] = []
  const recoveryEmitter = new EventEmitter2()
  recoveryEmitter.on('integration.retry', (payload: unknown) => recovered.push(payload))
  const recoveryDispatcher = new OutboxDispatcher(repository, recoveryEmitter)
  await recoveryDispatcher.onModuleInit()
  recoveryDispatcher.onModuleDestroy()

  assert.equal(recovered.length, 1)
  const recoveredPayload = recovered[0] as {
    ok: boolean
    eventId?: string
    eventMetadata?: { actorId?: string; requestId?: string }
  }
  assert.equal(recoveredPayload.ok, true)
  assert.equal(recoveredPayload.eventMetadata?.actorId, 'system')
  assert.match(recoveredPayload.eventMetadata?.requestId ?? '', /^[0-9a-f-]{36}$/)
  assert.match(recoveredPayload.eventId ?? '', /^[0-9a-f-]{36}$/)
  const recoveredRow = await repository.findOneBy({ eventName: 'integration.retry' })
  assert.ok(recoveredRow?.publishedAt)
  assert.equal(recoveredRow?.attempts, 1)
})

test('audit event IDs make outbox redelivery idempotent', async () => {
  const audit = new TypeOrmAuditService(dataSource.getRepository(AuditEntryEntity))
  const first = await audit.append({
    eventId: 'integration-event-1',
    action: 'INTEGRATION_TEST',
    entityType: 'TEST',
    entityId: 'test-1',
  })
  const second = await audit.append({
    eventId: 'integration-event-1',
    action: 'INTEGRATION_TEST',
    entityType: 'TEST',
    entityId: 'test-1',
  })

  assert.equal(first.isOk, true)
  assert.equal(second.isOk, true)
  if (first.isOk && second.isOk) assert.equal(second.value.id, first.value.id)

  const rows = await dataSource.query<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM audit_entries WHERE event_id = 'integration-event-1'`
  )
  assert.equal(rows[0]?.count, '1')
})

test('outbox dead-letters events after the configured retry limit', async () => {
  const previous = process.env.OUTBOX_MAX_ATTEMPTS
  process.env.OUTBOX_MAX_ATTEMPTS = '1'
  try {
    const repository = dataSource.getRepository(OutboxEventEntity)
    const outbox = new OutboxService(repository)
    await outbox.enqueue('integration.dead-letter', { ok: false })
    const emitter = new EventEmitter2()
    emitter.on('integration.dead-letter', () => {
      throw new Error('permanent listener failure')
    })
    const dispatcher = new OutboxDispatcher(repository, emitter)
    await dispatcher.onModuleInit()
    dispatcher.onModuleDestroy()

    const row = await repository.findOneBy({ eventName: 'integration.dead-letter' })
    assert.ok(row?.deadLetteredAt)
    assert.equal(row?.publishedAt, null)
    assert.equal(row?.attempts, 1)
  } finally {
    if (previous === undefined) delete process.env.OUTBOX_MAX_ATTEMPTS
    else process.env.OUTBOX_MAX_ATTEMPTS = previous
  }
})
