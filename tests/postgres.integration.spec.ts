import assert from 'node:assert/strict'
import { afterAll, beforeAll, test } from 'vitest'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DataSource } from 'typeorm'
import { InitialSchema1710000000000 } from '../src/database/migrations/1710000000000_initial_schema.js'
import { FixCamelCaseColumns1710000001000 } from '../src/database/migrations/1710000001000_fix_camel_case_columns.js'
import { HardenSchemaDefaults1710000002000 } from '../src/database/migrations/1710000002000_harden_schema_defaults.js'
import { ProductionHardening1710000003000 } from '../src/database/migrations/1710000003000_production_hardening.js'
import { WorkflowIntegrity1710000004000 } from '../src/database/migrations/1710000004000_workflow_integrity.js'
import { PurchaseOrderApproval1710000005000 } from '../src/database/migrations/1710000005000_purchase_order_approval.js'
import { TypeOrmProcurementService } from '../src/modules/procurement/services/typeorm_procurement_service.js'
import { SupplierEntity } from '../src/modules/procurement/entities/supplier.entity.js'
import { PurchaseOrderEntity } from '../src/modules/procurement/entities/purchase_order.entity.js'
import { PurchaseOrderLineEntity } from '../src/modules/procurement/entities/purchase_order_line.entity.js'
import { GoodsReceiptEntity } from '../src/modules/procurement/entities/goods_receipt.entity.js'
import { GoodsReceiptLineEntity } from '../src/modules/procurement/entities/goods_receipt_line.entity.js'
import { PurchaseRequisitionEntity } from '../src/modules/procurement/entities/purchase_requisition.entity.js'
import { PurchaseRequisitionLineEntity } from '../src/modules/procurement/entities/purchase_requisition_line.entity.js'
import { VendorInvoiceEntity } from '../src/modules/procurement/entities/vendor_invoice.entity.js'
import { VendorInvoiceLineEntity } from '../src/modules/procurement/entities/vendor_invoice_line.entity.js'
import { PurchaseOrderApprovedEvent } from '../src/modules/procurement/contracts/index.js'
import { InMemoryInventoryService } from '../src/modules/inventory/services/in_memory_inventory_service.js'
import { InMemoryFinanceService } from '../src/modules/finance/services/in_memory_finance_service.js'
import { OutboxPersistenceError } from '@platform/persistence/outbox.js'
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
  entities: [
    OutboxEventEntity,
    AuditEntryEntity,
    SupplierEntity,
    PurchaseOrderEntity,
    PurchaseOrderLineEntity,
    GoodsReceiptEntity,
    GoodsReceiptLineEntity,
    PurchaseRequisitionEntity,
    PurchaseRequisitionLineEntity,
    VendorInvoiceEntity,
    VendorInvoiceLineEntity,
  ],
  migrations: [
    InitialSchema1710000000000,
    FixCamelCaseColumns1710000001000,
    HardenSchemaDefaults1710000002000,
    ProductionHardening1710000003000,
    WorkflowIntegrity1710000004000,
    PurchaseOrderApproval1710000005000,
  ],
  synchronize: false,
})

beforeAll(async () => {
  await dataSource.initialize()
  await dataSource.dropDatabase()
  await dataSource.runMigrations()
  await dataSource.query(`INSERT INTO organization_units (id, code, name, kind) VALUES
    ('po-company', 'PO-COMPANY', 'PO Company', 'COMPANY'),
    ('po-warehouse-org', 'PO-WH-ORG', 'PO Warehouse', 'WAREHOUSE')`)
  await dataSource.query(
    `INSERT INTO inventory_units (id, code, name) VALUES ('po-unit', 'PO-UNIT', 'Piece')`
  )
  await dataSource.query(
    `INSERT INTO inventory_items (id, company_id, sku, name, unit_id) VALUES ('po-item', 'po-company', 'PO-ITEM', 'Item', 'po-unit')`
  )
  await dataSource.query(
    `INSERT INTO inventory_warehouses (id, company_id, organization_unit_id, code, name) VALUES ('po-warehouse', 'po-company', 'po-warehouse-org', 'PO-WH', 'Warehouse')`
  )
  await dataSource.query(
    `INSERT INTO suppliers (id, company_id, code, name) VALUES ('po-supplier', 'po-company', 'PO-SUPPLIER', 'Supplier')`
  )
  await inventory.registerUnit({ id: 'po-unit', code: 'PO-UNIT', name: 'Piece' })
  await inventory.registerItem({
    id: 'po-item',
    companyId: 'po-company',
    sku: 'PO-ITEM',
    name: 'Item',
    unitId: 'po-unit',
  })
  await inventory.registerWarehouse({
    id: 'po-warehouse',
    companyId: 'po-company',
    organizationUnitId: 'po-warehouse-org',
    code: 'PO-WH',
    name: 'Warehouse',
  })
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

const inventory = new InMemoryInventoryService()
const poScope = { scope: { organizationUnitId: 'po-company' } }
const managerApproval = {
  actorId: 'po-manager',
  roles: ['MANAGER'],
  expectedStepId: 'mgr-review',
  comment: 'Manager checked',
}
const directorApproval = {
  actorId: 'po-director',
  roles: ['DIRECTOR'],
  expectedStepId: 'director-review',
}

function procurementService(
  outbox = new OutboxService(dataSource.getRepository(OutboxEventEntity))
) {
  return new TypeOrmProcurementService(
    dataSource.getRepository(SupplierEntity),
    dataSource.getRepository(PurchaseOrderEntity),
    dataSource.getRepository(GoodsReceiptEntity),
    dataSource.getRepository(PurchaseRequisitionEntity),
    dataSource.getRepository(VendorInvoiceEntity),
    inventory,
    outbox,
    new InMemoryFinanceService()
  )
}

async function createPo(id: string, amount: bigint) {
  const result = await procurementService().createPurchaseOrder(
    {
      id,
      companyId: 'po-company',
      supplierId: 'po-supplier',
      number: id,
      lines: [
        { itemId: 'po-item', orderedQuantity: 1n, unitCostMinorUnits: amount, currency: 'TWD' },
      ],
    },
    poScope
  )
  assert.equal(result.isOk, true)
  return result.unwrapOrElse((error) => assert.fail(String(error)))
}

async function approvalEventCount(id: string) {
  const rows = await dataSource.query<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM outbox_events WHERE event_name = $1 AND payload->>'purchaseOrderId' = $2`,
    [PurchaseOrderApprovedEvent.EVENT_NAME, id]
  )
  return Number(rows[0]?.count ?? '0')
}

test('PostgreSQL PO approval resumes after service recreation and preserves historic decisions', async () => {
  await createPo('po-restart', 100000n)
  const service = procurementService()
  const first = (
    await service.approvePurchaseOrder('po-restart', managerApproval, poScope)
  ).unwrapOrElse((error) => assert.fail(String(error)))
  assert.equal(first.status, 'DRAFT')
  assert.equal(first.approval?.currentStepId, 'director-review')
  assert.equal(await approvalEventCount(first.id), 0)
  const restarted = procurementService()
  const loaded = (await restarted.getPurchaseOrder(first.id, poScope)).unwrapOrElse((error) =>
    assert.fail(String(error))
  )
  assert.deepEqual(loaded.approval?.history, first.approval?.history)
  const wrongScope = await restarted.getPurchaseOrder(first.id, {
    scope: { organizationUnitId: 'other-company' },
  })
  assert.equal(wrongScope.isErr && wrongScope.error.code, 'SCOPE_FORBIDDEN')
  const completed = (
    await restarted.approvePurchaseOrder(first.id, directorApproval, poScope)
  ).unwrapOrElse((error) => assert.fail(String(error)))
  assert.equal(completed.status, 'APPROVED')
  assert.equal(completed.approval?.history.length, 2)
  assert.deepEqual(completed.approval?.history[0], first.approval?.history[0])
  assert.equal(await approvalEventCount(first.id), 1)
  assert.equal(
    (await restarted.approvePurchaseOrder(first.id, directorApproval, poScope)).isErr,
    true
  )
  assert.equal(await approvalEventCount(first.id), 1)
})

test('PostgreSQL PO approval enforces threshold, stage roles and legacy status', async () => {
  await createPo('po-small', 99999n)
  const service = procurementService()
  const denied = await service.approvePurchaseOrder(
    'po-small',
    { ...managerApproval, roles: ['ADMIN'] },
    poScope
  )
  assert.equal(denied.isErr && denied.error.code, 'UNAUTHORIZED_APPROVER')
  const accepted = (
    await service.approvePurchaseOrder(
      'po-small',
      { ...managerApproval, roles: ['ADMIN', 'MANAGER'] },
      poScope
    )
  ).unwrapOrElse((error) => assert.fail(String(error)))
  assert.equal(accepted.status, 'APPROVED')
  assert.equal(accepted.approval?.history.length, 1)
  await createPo('po-legacy-draft', 100000n)
  await dataSource.query(
    `UPDATE purchase_orders SET approval_state = NULL WHERE id = 'po-legacy-draft'`
  )
  const legacy = (await service.getPurchaseOrder('po-legacy-draft', poScope)).unwrapOrElse(
    (error) => assert.fail(String(error))
  )
  assert.equal(legacy.approval?.currentStepId, 'mgr-review')
  assert.equal(legacy.approval?.history.length, 0)
  await createPo('po-legacy-approved', 100000n)
  await dataSource.query(
    `UPDATE purchase_orders SET status = 'APPROVED', approval_state = NULL WHERE id = 'po-legacy-approved'`
  )
  const approved = (await service.getPurchaseOrder('po-legacy-approved', poScope)).unwrapOrElse(
    (error) => assert.fail(String(error))
  )
  assert.equal(approved.status, 'APPROVED')
  assert.equal(approved.approval, null)
})

test('concurrent identical dual-role requests advance only the expected PO step', async () => {
  await createPo('po-concurrent', 100000n)
  const dual = { ...managerApproval, roles: ['MANAGER', 'DIRECTOR'] }
  const results = await Promise.all([
    procurementService().approvePurchaseOrder('po-concurrent', dual, poScope),
    procurementService().approvePurchaseOrder('po-concurrent', dual, poScope),
  ])
  assert.equal(results.filter((result) => result.isOk).length, 1)
  assert.equal(
    results.filter((result) => result.isErr && result.error.code === 'INVALID_APPROVAL_STEP')
      .length,
    1
  )
  const pending = (
    await procurementService().getPurchaseOrder('po-concurrent', poScope)
  ).unwrapOrElse((error) => assert.fail(String(error)))
  assert.equal(pending.status, 'DRAFT')
  assert.equal(pending.approval?.history.length, 1)
  assert.equal(pending.approval?.currentStepId, 'director-review')
  assert.equal(await approvalEventCount(pending.id), 0)
  await procurementService().approvePurchaseOrder(
    pending.id,
    { ...dual, expectedStepId: 'director-review' },
    poScope
  )
  assert.equal(await approvalEventCount(pending.id), 1)
})

test('outbox failure rolls back final PO decision and status together', async () => {
  await createPo('po-rollback', 100000n)
  const pending = (
    await procurementService().approvePurchaseOrder('po-rollback', managerApproval, poScope)
  ).unwrapOrElse((error) => assert.fail(String(error)))
  const failingOutbox = new OutboxService(dataSource.getRepository(OutboxEventEntity))
  failingOutbox.enqueue = async () => err(new OutboxPersistenceError())
  const failed = await procurementService(failingOutbox).approvePurchaseOrder(
    pending.id,
    directorApproval,
    poScope
  )
  assert.equal(failed.isErr && failed.error.code, 'APPROVAL_PUBLICATION_ERROR')
  const unchanged = (await procurementService().getPurchaseOrder(pending.id, poScope)).unwrapOrElse(
    (error) => assert.fail(String(error))
  )
  assert.equal(unchanged.status, 'DRAFT')
  assert.deepEqual(unchanged.approval, pending.approval)
  assert.equal(await approvalEventCount(pending.id), 0)
  await procurementService().approvePurchaseOrder(pending.id, directorApproval, poScope)
  assert.equal(await approvalEventCount(pending.id), 1)
})

test('PostgreSQL receipt and invoice matching lock only their joined aggregate roots', async () => {
  await createPo('po-receipt', 10n)
  const service = procurementService()
  await service.approvePurchaseOrder('po-receipt', managerApproval, poScope)
  const receipt = await service.receiveGoods(
    {
      id: 'po-receipt-gr',
      purchaseOrderId: 'po-receipt',
      warehouseId: 'po-warehouse',
      receivedAt: new Date(),
    },
    poScope
  )
  assert.equal(receipt.isOk, true)
  const invoice = await service.registerVendorInvoice(
    {
      id: 'po-receipt-invoice',
      companyId: 'po-company',
      supplierId: 'po-supplier',
      purchaseOrderId: 'po-receipt',
      invoiceNumber: 'PO-INV',
      invoiceDate: '2026-10-08',
      currency: 'TWD',
      taxRateBasisPoints: 0,
      lines: [
        {
          itemId: 'po-item',
          invoicedQuantity: 1n,
          unitPriceMinorUnits: 10n,
          lineTotalMinorUnits: 10n,
        },
      ],
    },
    poScope
  )
  assert.equal(invoice.isOk, true)
  const match = await service.matchVendorInvoice('po-receipt-invoice', {}, poScope)
  assert.equal(match.isOk, true)
  assert.equal(match.unwrapOrElse((error) => assert.fail(String(error))).isMatched, true)
})

test('corrupt persisted PO state fails closed without resetting or advancing approval', async () => {
  await createPo('po-corrupt', 100000n)
  const corrupt = { status: 'PENDING', currentStepId: 'director-review', history: [] }
  await dataSource.query('UPDATE purchase_orders SET approval_state = $1::jsonb WHERE id = $2', [
    JSON.stringify(corrupt),
    'po-corrupt',
  ])
  const service = procurementService()
  const loaded = await service.getPurchaseOrder('po-corrupt', poScope)
  assert.equal(loaded.isErr && loaded.error.code, 'INVALID_APPROVAL_STATE')
  const decision = await service.approvePurchaseOrder('po-corrupt', directorApproval, poScope)
  assert.equal(decision.isErr && decision.error.code, 'INVALID_APPROVAL_STATE')
  const stored = await dataSource
    .getRepository(PurchaseOrderEntity)
    .findOneByOrFail({ id: 'po-corrupt' })
  assert.equal(stored.status, 'DRAFT')
  assert.deepEqual(stored.approvalState, corrupt)
  assert.equal(await approvalEventCount(stored.id), 0)
  await createPo('po-inconsistent', 10n)
  await dataSource.query(
    `UPDATE purchase_orders SET status = 'APPROVED' WHERE id = 'po-inconsistent'`
  )
  const inconsistent = await service.getPurchaseOrder('po-inconsistent', poScope)
  assert.equal(inconsistent.isErr && inconsistent.error.code, 'INVALID_APPROVAL_STATE')
})
