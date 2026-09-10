import assert from 'node:assert/strict'
import { test } from 'vitest'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InMemoryInventoryService } from '@modules/inventory/services/in_memory_inventory_service.js'
import { InMemoryProcurementService } from '@modules/procurement/services/in_memory_procurement_service.js'
import { InMemoryAuditService } from '@modules/audit/services/in_memory_audit_service.js'
import { ProcurementAuditListener } from '@modules/audit/listeners/procurement_audit_listener.js'
import { InMemoryFinanceService } from '@modules/finance/services/in_memory_finance_service.js'
import {
  AccountsPayableVoucherCreatedEvent,
  GoodsReceivedEvent,
  PurchaseOrderApprovedEvent,
  PurchaseRequisitionApprovedEvent,
  VendorInvoiceMatchedEvent,
} from '@modules/procurement/contracts/index.js'

test('procurement service manages supplier, PO lifecycle, and goods receipt to inventory', async () => {
  const inventoryService = new InMemoryInventoryService()
  const procurementService = new InMemoryProcurementService(inventoryService)

  // 1. Setup inventory master
  await inventoryService.registerUnit({ id: 'u-pcs', code: 'PCS', name: 'Pieces' })
  await inventoryService.registerItem({
    id: 'item-bolt',
    companyId: 'comp-1',
    sku: 'BOLT-M8',
    name: 'M8 Bolt',
    unitId: 'u-pcs',
  })
  await inventoryService.registerWarehouse({
    id: 'wh-north',
    companyId: 'comp-1',
    organizationUnitId: 'org-wh-north',
    code: 'WH-N',
    name: 'North Warehouse',
  })

  // 2. Register supplier
  const supplier = await procurementService.registerSupplier({
    id: 'supp-1',
    companyId: 'comp-1',
    code: 'SUPP-ACME',
    name: 'Acme Hardware Inc',
  })
  assert.equal(supplier.isOk, true)

  // 3. Create PO
  const po = await procurementService.createPurchaseOrder({
    id: 'po-1001',
    companyId: 'comp-1',
    supplierId: 'supp-1',
    number: 'PO-2026-001',
    lines: [
      {
        itemId: 'item-bolt',
        orderedQuantity: 500n,
        unitCostMinorUnits: 250n, // 2.50 TWD
        currency: 'TWD',
      },
    ],
  })
  assert.equal(po.isOk, true)
  if (po.isOk) {
    assert.equal(po.value.status, 'DRAFT')
  }

  // 4. Cannot receive goods on DRAFT PO
  const earlyReceive = await procurementService.receiveGoods({
    id: 'gr-01',
    purchaseOrderId: 'po-1001',
    warehouseId: 'wh-north',
    receivedAt: new Date('2026-09-05T08:00:00Z'),
  })
  assert.equal(earlyReceive.isErr, true)

  // 5. Approve PO
  const approved = await procurementService.approvePurchaseOrder('po-1001')
  assert.equal(approved.isOk, true)
  if (approved.isOk) {
    assert.equal(approved.value.status, 'APPROVED')
  }

  // 6. Receive Goods -> records receipt and posts to inventory
  const receipt = await procurementService.receiveGoods({
    id: 'gr-01',
    purchaseOrderId: 'po-1001',
    warehouseId: 'wh-north',
    receivedAt: new Date('2026-09-05T08:00:00Z'),
  })
  assert.equal(receipt.isOk, true)

  // 7. Verify inventory stock updated
  const stock = await inventoryService.stock('comp-1', 'item-bolt', 'wh-north')
  assert.equal(stock.isOk, true)
  if (stock.isOk) {
    assert.equal(stock.value.quantity, 500n)
    assert.equal(stock.value.averageUnitCostMinorUnits, 250n)
    assert.equal(stock.value.currency, 'TWD')
  }
})

test('procurement service enforces multi-step approval workflow via ApprovalPipeline', async () => {
  const procurementService = new InMemoryProcurementService()

  await procurementService.registerSupplier({
    id: 'supp-pipeline',
    companyId: 'comp-1',
    code: 'SUPP-PIPE',
    name: 'Pipeline Supplier',
  })

  // Create expensive PO: 1,000 * 200 = 200,000 minor units (requires Director approval)
  const po = await procurementService.createPurchaseOrder({
    id: 'po-expensive',
    companyId: 'comp-1',
    supplierId: 'supp-pipeline',
    number: 'PO-EXP-001',
    lines: [
      {
        itemId: 'item-machinery',
        orderedQuantity: 1000n,
        unitCostMinorUnits: 200n,
        currency: 'TWD',
      },
    ],
  })
  assert.equal(po.isOk, true)

  // Unauthorized approver (Staff role only)
  const staffApprove = await procurementService.approvePurchaseOrder('po-expensive', {
    actorId: 'staff-01',
    roles: ['STAFF'],
  })
  assert.equal(staffApprove.isErr, true)
  if (staffApprove.isErr) {
    assert.equal(staffApprove.error.code, 'UNAUTHORIZED_APPROVER')
  }

  // Authorized manager approves (step 1 passes, but high-value PO requires Director)
  const managerApprove = await procurementService.approvePurchaseOrder('po-expensive', {
    actorId: 'mgr-01',
    roles: ['MANAGER'],
  })
  assert.equal(managerApprove.isOk, true)
  if (managerApprove.isOk) {
    // Step 1 done, but waiting for Director
    assert.equal(managerApprove.value.status, 'DRAFT')
  }

  // Director approves (step 2 passes -> PO approved!)
  const directorApprove = await procurementService.approvePurchaseOrder('po-expensive', {
    actorId: 'dir-01',
    roles: ['DIRECTOR'],
  })
  assert.equal(directorApprove.isOk, true)
  if (directorApprove.isOk) {
    assert.equal(directorApprove.value.status, 'APPROVED')
  }
})

test('procurement service emits domain events and triggers audit logging', async () => {
  const eventEmitter = new EventEmitter2()
  const auditService = new InMemoryAuditService()
  const auditListener = new ProcurementAuditListener(auditService)

  eventEmitter.on(GoodsReceivedEvent.EVENT_NAME, (e) => auditListener.handleGoodsReceived(e))
  eventEmitter.on(PurchaseOrderApprovedEvent.EVENT_NAME, (e) =>
    auditListener.handlePurchaseOrderApproved(e)
  )

  const inventoryService = new InMemoryInventoryService()
  const procurementService = new InMemoryProcurementService(inventoryService, eventEmitter)

  await inventoryService.registerUnit({ id: 'u-1', code: 'U1', name: 'Unit 1' })
  await inventoryService.registerItem({
    id: 'item-1',
    companyId: 'comp-event',
    sku: 'SKU-1',
    name: 'Item 1',
    unitId: 'u-1',
  })
  await inventoryService.registerWarehouse({
    id: 'wh-event',
    companyId: 'comp-event',
    organizationUnitId: 'org-wh-1',
    code: 'WH-EVT',
    name: 'Warehouse Event',
  })
  await procurementService.registerSupplier({
    id: 'supp-event',
    companyId: 'comp-event',
    code: 'SUPP-EVT',
    name: 'Supplier Event',
  })

  await procurementService.createPurchaseOrder({
    id: 'po-event-01',
    companyId: 'comp-event',
    supplierId: 'supp-event',
    number: 'PO-EVT-001',
    lines: [
      {
        itemId: 'item-1',
        orderedQuantity: 10n,
        unitCostMinorUnits: 50n,
        currency: 'TWD',
      },
    ],
  })

  // 1. Approve -> emits PurchaseOrderApprovedEvent -> audits PO approval
  await procurementService.approvePurchaseOrder('po-event-01')

  // 2. Receive -> emits GoodsReceivedEvent -> audits Goods Receipt
  await procurementService.receiveGoods({
    id: 'gr-event-01',
    purchaseOrderId: 'po-event-01',
    warehouseId: 'wh-event',
    receivedAt: new Date('2026-09-09T10:00:00Z'),
  })

  // Verify audit service recorded both events
  const entries = auditService.entries
  assert.equal(entries.length >= 2, true)
  const actions = entries.map((e) => e.action)
  assert.equal(actions.includes('PURCHASE_ORDER_APPROVED'), true)
  assert.equal(actions.includes('GOODS_RECEIVED'), true)
})

test('procurement service propagates inventory error when goods receipt movement fails', async () => {
  const inventoryService = new InMemoryInventoryService()
  const procurementService = new InMemoryProcurementService(inventoryService)

  await procurementService.registerSupplier({
    id: 'supp-2',
    companyId: 'comp-2',
    code: 'SUPP-2',
    name: 'Supplier 2',
  })

  await procurementService.createPurchaseOrder({
    id: 'po-2001',
    companyId: 'comp-2',
    supplierId: 'supp-2',
    number: 'PO-2026-002',
    lines: [
      {
        itemId: 'item-unregistered',
        orderedQuantity: 10n,
        unitCostMinorUnits: 100n,
        currency: 'TWD',
      },
    ],
  })

  await procurementService.approvePurchaseOrder('po-2001')

  // Receive goods into non-existent warehouse / item must return Result.err
  const failedReceipt = await procurementService.receiveGoods({
    id: 'gr-fail',
    purchaseOrderId: 'po-2001',
    warehouseId: 'wh-missing',
    receivedAt: new Date(),
  })

  assert.equal(failedReceipt.isErr, true)
  if (failedReceipt.isErr) {
    assert.equal(failedReceipt.error.code, 'PROCUREMENT_ERROR')
    assert.match(failedReceipt.error.message, /Inventory movement failed/)
  }
})

test('procurement service manages PR lifecycle from draft to approved and converted to PO', async () => {
  const eventEmitter = new EventEmitter2()
  const auditService = new InMemoryAuditService()
  const auditListener = new ProcurementAuditListener(auditService)
  eventEmitter.on(PurchaseRequisitionApprovedEvent.EVENT_NAME, (e) =>
    auditListener.handlePurchaseRequisitionApproved(e)
  )

  const procurementService = new InMemoryProcurementService(undefined, eventEmitter)

  await procurementService.registerSupplier({
    id: 'supp-pr',
    companyId: 'comp-pr',
    code: 'SUPP-PR',
    name: 'PR Supplier',
  })

  // 1. Create PR Draft
  const prRes = await procurementService.createRequisition({
    id: 'pr-101',
    companyId: 'comp-pr',
    requesterId: 'user-emp-1',
    number: 'PR-2026-001',
    memo: 'Office supplies for engineering',
    lines: [
      {
        itemId: 'item-keyboard',
        requestedQuantity: 5n,
        estimatedCostMinorUnits: 1200n,
        currency: 'TWD',
      },
    ],
  })
  assert.equal(prRes.isOk, true)
  if (prRes.isOk) {
    assert.equal(prRes.value.status, 'DRAFT')
  }

  // 2. Submit PR
  const submitRes = await procurementService.submitRequisition('pr-101')
  assert.equal(submitRes.isOk, true)
  if (submitRes.isOk) {
    assert.equal(submitRes.value.status, 'SUBMITTED')
  }

  // 3. Approve PR
  const approveRes = await procurementService.approveRequisition('pr-101', {
    actorId: 'mgr-01',
    roles: ['MANAGER'],
  })
  assert.equal(approveRes.isOk, true)
  if (approveRes.isOk) {
    assert.equal(approveRes.value.status, 'APPROVED')
  }

  // 4. Convert PR to PO
  const convertRes = await procurementService.convertRequisitionToPurchaseOrder('pr-101', {
    purchaseOrderId: 'po-from-pr',
    purchaseOrderNumber: 'PO-FROM-PR-001',
    supplierId: 'supp-pr',
  })
  assert.equal(convertRes.isOk, true)
  if (convertRes.isOk) {
    assert.equal(convertRes.value.id, 'po-from-pr')
    assert.equal(convertRes.value.lines.length, 1)
    assert.equal(convertRes.value.lines[0]!.orderedQuantity, 5n)
    assert.equal(convertRes.value.lines[0]!.unitCostMinorUnits, 1200n)
  }

  // Verify Audit log captured PR approval
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'PURCHASE_REQUISITION_APPROVED'),
    true
  )
})

test('procurement service executes 3-way matching and creates balanced AP voucher in finance', async () => {
  const eventEmitter = new EventEmitter2()
  const auditService = new InMemoryAuditService()
  const auditListener = new ProcurementAuditListener(auditService)
  eventEmitter.on(VendorInvoiceMatchedEvent.EVENT_NAME, (e) =>
    auditListener.handleVendorInvoiceMatched(e)
  )
  eventEmitter.on(AccountsPayableVoucherCreatedEvent.EVENT_NAME, (e) =>
    auditListener.handleAccountsPayableVoucherCreated(e)
  )

  const inventoryService = new InMemoryInventoryService()
  const financeService = new InMemoryFinanceService()
  const procurementService = new InMemoryProcurementService(
    inventoryService,
    eventEmitter,
    financeService
  )

  // 1. Setup master data
  await inventoryService.registerUnit({ id: 'u-ea', code: 'EA', name: 'Each' })
  await inventoryService.registerItem({
    id: 'item-pc',
    companyId: 'comp-ap',
    sku: 'PC-DESK',
    name: 'Desktop PC',
    unitId: 'u-ea',
  })
  await inventoryService.registerWarehouse({
    id: 'wh-ap',
    companyId: 'comp-ap',
    organizationUnitId: 'org-ap',
    code: 'WH-AP',
    name: 'AP Warehouse',
  })
  await procurementService.registerSupplier({
    id: 'supp-ap',
    companyId: 'comp-ap',
    code: 'SUPP-AP',
    name: 'Hardware Vendor',
  })

  // 2. Create and Approve PO
  await procurementService.createPurchaseOrder({
    id: 'po-ap-1',
    companyId: 'comp-ap',
    supplierId: 'supp-ap',
    number: 'PO-AP-001',
    lines: [
      {
        itemId: 'item-pc',
        orderedQuantity: 10n,
        unitCostMinorUnits: 20000n, // 200.00 TWD
        currency: 'TWD',
      },
    ],
  })
  await procurementService.approvePurchaseOrder('po-ap-1')

  // 3. Receive Goods
  const grRes = await procurementService.receiveGoods({
    id: 'gr-ap-1',
    purchaseOrderId: 'po-ap-1',
    warehouseId: 'wh-ap',
    receivedAt: new Date('2026-09-10T10:00:00Z'),
    lines: [{ itemId: 'item-pc', receivedQuantity: 10n }],
  })
  assert.equal(grRes.isOk, true)

  // 4. Register Vendor Invoice: 10 * 200.00 = 2,000.00 TWD (200,000 minor) + 5% tax (10,000 minor) = 210,000 minor
  const invRes = await procurementService.registerVendorInvoice({
    id: 'inv-ap-1',
    companyId: 'comp-ap',
    supplierId: 'supp-ap',
    purchaseOrderId: 'po-ap-1',
    invoiceNumber: 'INV-HW-2026-01',
    invoiceDate: '2026-09-10',
    currency: 'TWD',
    lines: [
      {
        itemId: 'item-pc',
        invoicedQuantity: 10n,
        unitPriceMinorUnits: 20000n,
      },
    ],
  })
  assert.equal(invRes.isOk, true)
  if (invRes.isOk) {
    assert.equal(invRes.value.netAmountMinorUnits, 200_000n)
    assert.equal(invRes.value.taxAmountMinorUnits, 10_000n)
    assert.equal(invRes.value.totalAmountMinorUnits, 210_000n)
    assert.equal(invRes.value.status, 'RECEIVED')
  }

  // 5. Execute 3-Way Matching
  const matchRes = await procurementService.matchVendorInvoice('inv-ap-1', {
    quantityToleranceBasisPoints: 0,
    priceToleranceBasisPoints: 0,
  })
  assert.equal(matchRes.isOk, true)
  if (matchRes.isOk) {
    assert.equal(matchRes.value.isMatched, true)
    assert.equal(matchRes.value.status, 'MATCHED')
    assert.equal(matchRes.value.lineMatches.length, 1)
  }

  // 6. Create Accounts Payable (AP) Voucher in Finance
  const apRes = await procurementService.createAccountsPayableVoucher({
    invoiceId: 'inv-ap-1',
    voucherId: 'je-ap-001',
    voucherNumber: 'JE-AP-2026-001',
    accountingDate: '2026-09-10',
    inventoryAccountId: 'acc-1200-inventory',
    taxAccountId: 'acc-1251-input-tax',
    payableAccountId: 'acc-2100-ap-vendor',
  })
  assert.equal(apRes.isOk, true)
  if (apRes.isOk) {
    assert.equal(apRes.value.journalEntryId, 'je-ap-001')
    assert.equal(apRes.value.totalAmountMinorUnits, 210_000n)
  }

  // 7. Verify Audit log recorded VENDOR_INVOICE_MATCHED and ACCOUNTS_PAYABLE_VOUCHER_CREATED
  const auditEntries = auditService.entries
  assert.equal(
    auditEntries.some((e) => e.action === 'VENDOR_INVOICE_MATCHED'),
    true
  )
  assert.equal(
    auditEntries.some((e) => e.action === 'ACCOUNTS_PAYABLE_VOUCHER_CREATED'),
    true
  )
})

test('procurement service marks invoice as DISPUTED and prevents AP voucher when tolerance is exceeded', async () => {
  const procurementService = new InMemoryProcurementService()

  await procurementService.registerSupplier({
    id: 'supp-disp',
    companyId: 'comp-disp',
    code: 'SUPP-DISP',
    name: 'Dispute Supplier',
  })

  await procurementService.createPurchaseOrder({
    id: 'po-disp',
    companyId: 'comp-disp',
    supplierId: 'supp-disp',
    number: 'PO-DISP-001',
    lines: [
      {
        itemId: 'item-bolt',
        orderedQuantity: 100n,
        unitCostMinorUnits: 50n,
        currency: 'TWD',
      },
    ],
  })
  await procurementService.approvePurchaseOrder('po-disp')

  // Only received 80 pieces
  await procurementService.receiveGoods({
    id: 'gr-disp',
    purchaseOrderId: 'po-disp',
    warehouseId: 'wh-1',
    receivedAt: new Date(),
    lines: [{ itemId: 'item-bolt', receivedQuantity: 80n }],
  })

  // Vendor bills for 100 pieces (20 pieces over received)
  const invRes = await procurementService.registerVendorInvoice({
    id: 'inv-overbill',
    companyId: 'comp-disp',
    supplierId: 'supp-disp',
    purchaseOrderId: 'po-disp',
    invoiceNumber: 'INV-OVERBILL-1',
    invoiceDate: '2026-09-10',
    currency: 'TWD',
    lines: [
      {
        itemId: 'item-bolt',
        invoicedQuantity: 100n, // over-invoiced!
        unitPriceMinorUnits: 50n,
      },
    ],
  })
  assert.equal(invRes.isOk, true)

  // 3-Way Match with 0 tolerance should fail
  const matchRes = await procurementService.matchVendorInvoice('inv-overbill', {
    quantityToleranceBasisPoints: 0,
  })
  assert.equal(matchRes.isErr, true)
  if (matchRes.isErr) {
    assert.equal(matchRes.error.code, 'MATCHING_TOLERANCE_EXCEEDED')
    assert.equal(matchRes.error.details.field, 'QUANTITY')
  }

  // Attempting to create AP voucher on un-matched/disputed invoice must fail
  const apRes = await procurementService.createAccountsPayableVoucher({
    invoiceId: 'inv-overbill',
    voucherId: 'je-fail',
    voucherNumber: 'JE-FAIL-01',
    accountingDate: '2026-09-10',
  })
  assert.equal(apRes.isErr, true)
  if (apRes.isErr) {
    assert.equal(apRes.error.code, 'INVALID_VENDOR_INVOICE_STATE')
  }
})
