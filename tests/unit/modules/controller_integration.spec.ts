import assert from 'node:assert/strict'
import { test } from 'vitest'
import { AppController } from '../../../src/app.controller.js'
import { call, ORPCError } from '@orpc/server'
import { serializeApiValue } from '@platform/http/result_adapter.js'
import { InMemoryOrganizationService } from '@modules/organization/services/in_memory_organization_service.js'
import { OrganizationUnitsController } from '@modules/organization/controllers/organization_units.controller.js'
import { InMemoryIdentityService } from '@modules/identity/services/in_memory_identity_service.js'
import { IdentityController } from '@modules/identity/controllers/identity.controller.js'
import { InMemoryInventoryService } from '@modules/inventory/services/in_memory_inventory_service.js'
import { InventoryMovementsController } from '@modules/inventory/controllers/inventory_movements.controller.js'
import { InventoryMasterController } from '@modules/inventory/controllers/inventory_master.controller.js'
import { InMemoryProcurementService } from '@modules/procurement/services/in_memory_procurement_service.js'
import { ProcurementController } from '@modules/procurement/controllers/procurement.controller.js'
import { InMemoryFinanceService } from '@modules/finance/services/in_memory_finance_service.js'
import { JournalEntriesController } from '@modules/finance/controllers/journal_entries.controller.js'
import { InMemorySalesService } from '@modules/sales/services/in_memory_sales_service.js'
import { SalesController } from '@modules/sales/controllers/sales.controller.js'
import { InMemoryTreasuryService } from '@modules/treasury/services/in_memory_treasury_service.js'
import { TreasuryController } from '@modules/treasury/controllers/treasury.controller.js'
import { InMemoryManufacturingService } from '@modules/manufacturing/services/in_memory_manufacturing_service.js'
import { ManufacturingController } from '@modules/manufacturing/controllers/manufacturing.controller.js'

const approverRequest = {
  user: {
    id: 'manager-1',
    username: 'manager',
    displayName: 'Manager',
    isActive: true,
    roles: ['MANAGER'],
    organizationUnitIds: ['comp-1', 'comp-ctrl'],
  },
}

// Nullable TypeORM columns are returned as null despite optional entity property types.
function databaseNulls<T extends object>(snapshot: T, fields: readonly (keyof T)[]): T {
  return Object.defineProperties(
    { ...snapshot },
    Object.fromEntries(fields.map((field) => [field, { value: null, enumerable: true }]))
  )
}

test('AppController returns service health status', () => {
  const controller = new AppController()
  const health = controller.getHealth()
  assert.deepEqual(health, { service: 'flash-erp', status: 'ok' })
})

test('serializeApiValue safely converts BigInt primitives to strings for JSON serialization', () => {
  const input = {
    id: 'entry-1',
    amount: 1000000000000000000n,
    at: new Date('2026-10-08T00:00:00.000Z'),
    nested: {
      qty: 42n,
      label: 'test',
    },
    list: [1n, 2n, 3n],
  }

  const serialized = serializeApiValue(input)
  // Must be valid JSON without throwing "Do not know how to serialize a BigInt"
  const json = JSON.stringify(serialized)
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), {
    id: 'entry-1',
    amount: '1000000000000000000',
    at: '2026-10-08T00:00:00.000Z',
    nested: {
      qty: '42',
      label: 'test',
    },
    list: ['1', '2', '3'],
  })
})

test('OrganizationUnitsController registers and queries organization units', async () => {
  const orgService = new InMemoryOrganizationService()
  const controller = new OrganizationUnitsController(orgService)

  const mockRes = await call(controller.register(), {
    id: 'comp-1',
    code: 'ACME',
    name: 'Acme Corp',
    kind: 'COMPANY',
  })

  assert.equal(mockRes.code, 'ACME')

  const findRes = await call(controller.find(), { id: 'comp-1' })

  assert.equal(findRes.id, 'comp-1')

  // Register plant under company

  await call(controller.register(), {
    id: 'plant-1',
    code: 'PLANT-1',
    name: 'Plant 1',
    kind: 'PLANT',
    parentId: 'comp-1',
  })

  // Error case: invalid parent

  await assert.rejects(
    call(controller.register(), {
      id: 'wh-bad',
      code: 'WH-BAD',
      name: 'Bad WH',
      kind: 'WAREHOUSE',
      parentId: 'comp-1',
    }),
    { code: 'INVALID_ORGANIZATION_UNIT', status: 422, defined: true }
  )
})

test('IdentityController registers local users and maps conflict status', async () => {
  const identityService = new InMemoryIdentityService()
  const controller = new IdentityController(identityService)

  const res1 = await call(controller.register(), {
    id: 'u1',
    username: 'carol',
    displayName: 'Carol Danvers',
    password: 'correct horse battery staple',
  })

  assert.equal(res1.username, 'carol')

  // Duplicate registration returns 409 Conflict

  await assert.rejects(
    call(controller.register(), {
      id: 'u2',
      username: 'carol',
      displayName: 'Carol 2',
      password: 'correct horse battery staple',
    }),
    { code: 'IDENTITY_ALREADY_EXISTS', status: 409, defined: true }
  )
})

test('Inventory controllers safely serialize BigInt fields across movements and stock query', async () => {
  const invService = new InMemoryInventoryService()
  const masterCtrl = new InventoryMasterController(invService)
  const movCtrl = new InventoryMovementsController(invService)

  await call(masterCtrl.unit(), { id: 'u-kg', code: 'KG', name: 'Kilograms' })

  await call(masterCtrl.item(), {
    id: 'item-steel',
    companyId: 'comp-1',
    sku: 'STEEL-01',
    name: 'Steel',
    unitId: 'u-kg',
  })

  await call(masterCtrl.warehouse(), {
    id: 'wh-main',
    companyId: 'comp-1',
    organizationUnitId: 'org-wh-1',
    code: 'MAIN',
    name: 'Main',
  })

  // Inbound movement: quantityDelta: 50, unitCostMinorUnits: 2000

  const mRes = await call(movCtrl.store(), {
    id: 'mov-001',
    companyId: 'comp-1',
    itemId: 'item-steel',
    warehouseId: 'wh-main',
    sourceType: 'RECEIPT',
    sourceId: 'rec-1',
    quantityDelta: '50',
    unitCostMinorUnits: '2000',
    currency: 'TWD',
    occurredAt: '2026-09-01T00:00:00.000Z',
  })

  // Ensure payload BigInts are safely serialized to strings
  const mPayload = mRes
  assert.equal(typeof mPayload.quantityDelta, 'string')
  assert.equal(typeof mPayload.unitCostMinorUnits, 'string')
  assert.doesNotThrow(() => JSON.stringify(mPayload))

  // Show stock

  const sRes = await call(movCtrl.showStock(), {
    companyId: 'comp-1',
    itemId: 'item-steel',
    warehouseId: 'wh-main',
  })

  const sPayload = sRes
  assert.equal(sPayload.quantity, '50')
  assert.equal(sPayload.averageUnitCostMinorUnits, '2000')
  assert.doesNotThrow(() => JSON.stringify(sPayload))
})

test('ProcurementController creates PO and receives goods with inventory integration and BigInt safety', async () => {
  const invService = new InMemoryInventoryService()
  const procService = new InMemoryProcurementService(invService)
  const procCtrl = new ProcurementController(procService)

  await invService.registerUnit({ id: 'u-pcs', code: 'PCS', name: 'Pieces' })
  await invService.registerItem({
    id: 'item-cable',
    companyId: 'comp-1',
    sku: 'CABLE-1M',
    name: '1m Cable',
    unitId: 'u-pcs',
  })
  await invService.registerWarehouse({
    id: 'wh-east',
    companyId: 'comp-1',
    organizationUnitId: 'org-wh-east',
    code: 'EAST',
    name: 'East WH',
  })

  // Register supplier

  const suppRes = await call(procCtrl.registerSupplier(), {
    id: 'supp-global',
    companyId: 'comp-1',
    code: 'SUPP-G',
    name: 'Global Tech',
  })

  // Create PO

  const poRes = await call(procCtrl.createPO(), {
    id: 'po-5001',
    companyId: 'comp-1',
    supplierId: 'supp-global',
    number: 'PO-5001',
    lines: [
      {
        itemId: 'item-cable',
        orderedQuantity: '100',
        unitCostMinorUnits: '350',
        currency: 'TWD',
      },
    ],
  })

  const poPayload = poRes
  assert.equal(poPayload.status, 'DRAFT')
  assert.equal(poPayload.lines[0].orderedQuantity, '100')
  assert.doesNotThrow(() => JSON.stringify(poPayload))

  // Approve PO

  await call(procCtrl.approvePO(approverRequest), { id: 'po-5001', expectedStepId: 'mgr-review' })

  // Receive goods

  const grRes = await call(procCtrl.receiveGoods(), {
    id: 'gr-9001',
    purchaseOrderId: 'po-5001',
    warehouseId: 'wh-east',
    receivedAt: '2026-09-02T12:00:00.000Z',
  })

  // Verify stock was updated in inventory
  const stock = await invService.stock('comp-1', 'item-cable', 'wh-east')
  assert.equal(stock.isOk, true)
  if (stock.isOk) {
    assert.equal(stock.value.quantity, 100n)
    assert.equal(stock.value.averageUnitCostMinorUnits, 350n)
  }
})

test('ProcurementController handles PR lifecycle, vendor invoice registration, 3-way matching, and AP voucher creation', async () => {
  const invService = new InMemoryInventoryService()
  const finService = new InMemoryFinanceService()
  const procService = new InMemoryProcurementService(invService, undefined, finService)
  const procCtrl = new ProcurementController(procService)

  // 0. Setup inventory master data
  await invService.registerUnit({ id: 'u-pc', code: 'PC', name: 'Piece' })
  await invService.registerItem({
    id: 'item-monitor',
    companyId: 'comp-ctrl',
    sku: 'MON-4K',
    name: '4K Monitor',
    unitId: 'u-pc',
  })
  await invService.registerWarehouse({
    id: 'wh-ctrl',
    companyId: 'comp-ctrl',
    organizationUnitId: 'org-wh-ctrl',
    code: 'WH-CTRL',
    name: 'Ctrl WH',
  })

  // 1. Register supplier

  const suppRes = await call(procCtrl.registerSupplier(), {
    id: 'supp-ap-ctrl',
    companyId: 'comp-ctrl',
    code: 'SUPP-AC',
    name: 'AP Controller Supplier',
  })

  // 2. PR creation, submit, approve, convert

  await call(procCtrl.createRequisition(), {
    id: 'pr-ctrl-1',
    companyId: 'comp-ctrl',
    requesterId: 'user-req-1',
    number: 'PR-CTRL-001',
    memo: 'New Monitors',
    lines: [
      {
        itemId: 'item-monitor',
        requestedQuantity: '2',
        estimatedCostMinorUnits: '5000',
        currency: 'TWD',
      },
    ],
  })

  await call(procCtrl.submitRequisition(), { id: 'pr-ctrl-1' })

  await call(procCtrl.approveRequisition(approverRequest), {
    id: 'pr-ctrl-1',
    ...{ comment: 'Approved by Director' },
  })

  await call(procCtrl.convertRequisition(), {
    id: 'pr-ctrl-1',
    ...{
      purchaseOrderId: 'po-ctrl-1',
      purchaseOrderNumber: 'PO-CTRL-001',
      supplierId: 'supp-ap-ctrl',
    },
  })

  // 3. Approve PO & Receive goods

  await call(procCtrl.approvePO(approverRequest), { id: 'po-ctrl-1', expectedStepId: 'mgr-review' })

  const grRes = await call(procCtrl.receiveGoods(), {
    id: 'gr-ctrl-1',
    purchaseOrderId: 'po-ctrl-1',
    warehouseId: 'wh-ctrl',
    receivedAt: '2026-09-10T12:00:00Z',
    lines: [{ itemId: 'item-monitor', receivedQuantity: '2' }],
  })

  // 4. Register vendor invoice: 2 * 5,000 = 10,000 minor + 5% tax (500 minor) = 10,500 minor

  const invRes = await call(procCtrl.registerInvoice(), {
    id: 'inv-ctrl-1',
    companyId: 'comp-ctrl',
    supplierId: 'supp-ap-ctrl',
    purchaseOrderId: 'po-ctrl-1',
    invoiceNumber: 'INV-CTRL-001',
    invoiceDate: '2026-09-10',
    currency: 'TWD',
    taxRateBasisPoints: 500,
    lines: [
      {
        itemId: 'item-monitor',
        invoicedQuantity: '2',
        unitPriceMinorUnits: '5000',
      },
    ],
  })

  const invPayload = invRes
  assert.equal(invPayload.status, 'RECEIVED')
  assert.equal(invPayload.netAmountMinorUnits, '10000')
  assert.equal(invPayload.taxAmountMinorUnits, '500')
  assert.equal(invPayload.totalAmountMinorUnits, '10500')
  assert.doesNotThrow(() => JSON.stringify(invPayload))

  // 5. Match invoice

  const matchRes = await call(procCtrl.matchInvoice(), { id: 'inv-ctrl-1', ...{} })

  const matchPayload = matchRes
  assert.equal(matchPayload.isMatched, true)
  assert.equal(matchPayload.status, 'MATCHED')

  // 6. Create AP Voucher

  const voucherRes = await call(procCtrl.createApVoucher(), {
    id: 'inv-ctrl-1',
    ...{
      voucherId: 'je-ctrl-ap-1',
      voucherNumber: 'JE-AP-CTRL-01',
      accountingDate: '2026-09-10',
      inventoryAccountId: 'acc-inv',
      taxAccountId: 'acc-tax',
      payableAccountId: 'acc-ap',
      memo: 'Test AP Voucher via Controller',
    },
  })

  const voucherPayload = voucherRes
  assert.equal(voucherPayload.journalEntryId, 'je-ctrl-ap-1')
  assert.equal(voucherPayload.totalAmountMinorUnits, '10500')
  assert.doesNotThrow(() => JSON.stringify(voucherPayload))
})

test('SalesController registers customers, checks credit, manages sales orders and shipments', async () => {
  const inventoryService = new InMemoryInventoryService()
  const financeService = new InMemoryFinanceService()
  const salesService = new InMemorySalesService(inventoryService, undefined, financeService)
  const salesCtrl = new SalesController(salesService)

  // 1. Setup inventory master & stock
  await inventoryService.registerUnit({ id: 'u-pcs-sales', code: 'PCS', name: 'Pieces' })
  await inventoryService.registerItem({
    id: 'item-keyboard',
    companyId: 'comp-sales',
    sku: 'KB-MECH',
    name: 'Mechanical Keyboard',
    unitId: 'u-pcs-sales',
  })
  await inventoryService.registerWarehouse({
    id: 'wh-sales-main',
    companyId: 'comp-sales',
    organizationUnitId: 'org-wh-sales',
    code: 'WH-MAIN',
    name: 'Sales Main WH',
  })
  await inventoryService.recordMovement({
    id: 'mov-kb-init',
    companyId: 'comp-sales',
    itemId: 'item-keyboard',
    warehouseId: 'wh-sales-main',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'gr-kb',
    quantityDelta: 20n,
    unitCostMinorUnits: 1500n, // 15.00 TWD
    currency: 'TWD',
    occurredAt: new Date(),
  })

  // 2. Register Customer via SalesController

  const custRes = await call(salesCtrl.registerCustomer(), {
    id: 'cust-ctrl-1',
    companyId: 'comp-sales',
    code: 'CUST-STORE-1',
    name: 'Retail Store 1',
    paymentTerms: 'NET30',
    currency: 'TWD',
    creditLimitMinorUnits: '500000', // 5,000 TWD
  })

  const custPayload = custRes
  assert.equal(custPayload.code, 'CUST-STORE-1')
  assert.equal(custPayload.creditLimitMinorUnits, '500000')
  assert.doesNotThrow(() => JSON.stringify(custPayload))

  // 3. Check Credit via SalesController

  const creditRes = await call(salesCtrl.checkCredit(), {
    id: 'cust-ctrl-1',
    additionalAmount: '100000',
  })

  const creditPayload = creditRes
  assert.equal(creditPayload.isApproved, true)
  assert.equal(creditPayload.totalExposureMinorUnits, '100000')
  assert.doesNotThrow(() => JSON.stringify(creditPayload))

  // 4. Create Sales Order via SalesController

  const soRes = await call(salesCtrl.createSalesOrder(), {
    id: 'so-ctrl-1',
    companyId: 'comp-sales',
    customerId: 'cust-ctrl-1',
    number: 'SO-CTRL-001',
    memo: 'Controller test order',
    taxRateBasisPoints: 500,
    lines: [
      {
        itemId: 'item-keyboard',
        warehouseId: 'wh-sales-main',
        orderedQuantity: '5',
        unitPriceMinorUnits: '3000', // 30.00 TWD each -> Net 15,000, Tax 750, Total 15,750
        currency: 'TWD',
      },
    ],
  })

  const soPayload = soRes
  assert.equal(soPayload.status, 'DRAFT')
  assert.equal(soPayload.netAmountMinorUnits, '15000')
  assert.equal(soPayload.taxAmountMinorUnits, '750')
  assert.equal(soPayload.totalAmountMinorUnits, '15750')
  assert.doesNotThrow(() => JSON.stringify(soPayload))

  // 5. Confirm Sales Order via SalesController (reserves ATP inventory stock)

  const confirmRes = await call(salesCtrl.confirmOrder(), { id: 'so-ctrl-1' })

  const confirmPayload = confirmRes
  assert.equal(confirmPayload.status, 'CONFIRMED')
  assert.equal(confirmPayload.reservationIds.length, 1)
  assert.doesNotThrow(() => JSON.stringify(confirmPayload))

  // 6. Create Shipment via SalesController (deducts stock, releases reservation, creates AR/COGS vouchers)

  const shipRes = await call(salesCtrl.createShipment(), {
    id: 'ship-ctrl-1',
    salesOrderId: 'so-ctrl-1',
    warehouseId: 'wh-sales-main',
    shipmentDate: '2026-09-10',
    lines: [
      {
        itemId: 'item-keyboard',
        shippedQuantity: '5',
      },
    ],
  })

  const shipPayload = shipRes
  assert.equal(shipPayload.status, 'SHIPPED')
  assert.equal(shipPayload.totalShippedAmountMinorUnits, '15750')
  assert.doesNotThrow(() => JSON.stringify(shipPayload))
})

test('TreasuryController registers bank accounts, handles payments, receipts, and bank reconciliation', async () => {
  const finance = new InMemoryFinanceService()
  const journalEntries = new JournalEntriesController(finance)
  const draft = await call(journalEntries.store(), {
    id: 'journal-null-memo',
    companyId: 'comp-ctrl',
    number: 'JE-NULL-MEMO',
    accountingDate: '2026-09-10',
    currency: 'TWD',
    memo: null,
    lines: [
      { accountId: 'debit-account', debitMinorUnits: '100', creditMinorUnits: '0', memo: null },
      { accountId: 'credit-account', debitMinorUnits: '0', creditMinorUnits: '100', memo: null },
    ],
  })
  assert.equal(draft.memo, undefined)
  assert.equal(draft.totalDebitMinorUnits, '100')
  assert.equal(draft.totalCreditMinorUnits, '100')
  assert.equal((await call(journalEntries.post(), { id: draft.id })).status, 'POSTED')
  const treasury = new InMemoryTreasuryService(finance)
  const treasuryCtrl = new TreasuryController(treasury)

  // 1. Register Bank Account via TreasuryController

  const acctRes = await call(treasuryCtrl.registerBankAccount(), {
    id: 'bank-ctrl-01',
    companyId: 'comp-ctrl',
    accountNumber: '700-112233',
    bankCode: '700',
    bankName: 'Post Office Bank',
    accountName: 'Operating Account',
    currency: 'TWD',
    glAccountId: 'acc-1102-post',
    initialBalanceMinorUnits: '200000', // 2,000 TWD
  })

  const acctPayload = acctRes
  assert.equal(acctPayload.accountNumber, '700-112233')
  assert.equal(acctPayload.currentBalanceMinorUnits, '200000')
  assert.doesNotThrow(() => JSON.stringify(acctPayload))

  // 2. Query Bank Account via TreasuryController

  await call(treasuryCtrl.getBankAccount(), { id: 'bank-ctrl-01' })

  // 3. Create and Post Receipt via TreasuryController

  await call(treasuryCtrl.createReceipt(), {
    id: 'rcpt-ctrl-01',
    companyId: 'comp-ctrl',
    bankAccountId: 'bank-ctrl-01',
    receiptNumber: 'RCPT-CTRL-01',
    receiptDate: '2026-09-10',
    payerType: 'CUSTOMER',
    payerId: 'cust-ctrl-1',
    amountMinorUnits: '50000',
  })

  const postRcptRes = await call(treasuryCtrl.postReceipt(), { id: 'rcpt-ctrl-01' })

  const postRcptPayload = postRcptRes
  assert.equal(postRcptPayload.status, 'POSTED')
  assert.doesNotThrow(() => JSON.stringify(postRcptPayload))

  // 4. Create and Post Payment via TreasuryController

  await call(treasuryCtrl.createPayment(), {
    id: 'pmt-ctrl-01',
    companyId: 'comp-ctrl',
    bankAccountId: 'bank-ctrl-01',
    paymentNumber: 'PMT-CTRL-01',
    paymentDate: '2026-09-10',
    beneficiaryType: 'SUPPLIER',
    beneficiaryId: 'supp-ctrl-1',
    amountMinorUnits: '30000',
  })

  const postPmtRes = await call(treasuryCtrl.postPayment(), { id: 'pmt-ctrl-01' })

  const postPmtPayload = postPmtRes
  assert.equal(postPmtPayload.status, 'POSTED')
  assert.doesNotThrow(() => JSON.stringify(postPmtPayload))

  // 5. Import and Reconcile Bank Statement via TreasuryController
  // Current bank balance: 200,000 + 50,000 - 30,000 = 220,000

  await call(treasuryCtrl.importBankStatement(), {
    id: 'stmt-ctrl-01',
    bankAccountId: 'bank-ctrl-01',
    statementNumber: 'STMT-CTRL-001',
    statementDate: '2026-09-10',
    openingBalanceMinorUnits: '200000',
    closingBalanceMinorUnits: '220000',
    lines: [
      {
        id: 'stmt-ctrl-line-1',
        transactionDate: '2026-09-10',
        direction: 'CREDIT',
        amountMinorUnits: '50000',
        reference: 'RCPT-CTRL-01',
      },
      {
        id: 'stmt-ctrl-line-2',
        transactionDate: '2026-09-10',
        direction: 'DEBIT',
        amountMinorUnits: '30000',
        reference: 'PMT-CTRL-01',
      },
    ],
  })

  const reconRes = await call(treasuryCtrl.reconcileBankStatement(), { id: 'stmt-ctrl-01' })

  const reconPayload = reconRes
  assert.equal(reconPayload.isBalanced, true)
  assert.equal(reconPayload.matchedCount, 2)
  assert.equal(reconPayload.differenceMinorUnits, '0')
  assert.doesNotThrow(() => JSON.stringify(reconPayload))
})

test('ManufacturingController registers BOM, manages work order lifecycle, issues materials, completes production and allocates overheads', async () => {
  const invService = new InMemoryInventoryService()
  const finService = new InMemoryFinanceService()
  const mfgService = new InMemoryManufacturingService(invService, finService)
  const mfgCtrl = new ManufacturingController(mfgService)

  // 1. Setup inventory master data and stock
  await invService.registerUnit({ id: 'u-pc-mfg', code: 'PC', name: 'Piece' })
  await invService.registerItem({
    id: 'item-cpu',
    companyId: 'comp-mfg',
    sku: 'CPU-8C',
    name: '8-Core CPU',
    unitId: 'u-pc-mfg',
  })
  await invService.registerItem({
    id: 'item-case',
    companyId: 'comp-mfg',
    sku: 'CASE-ATX',
    name: 'ATX Case',
    unitId: 'u-pc-mfg',
  })
  await invService.registerItem({
    id: 'item-pc-complete',
    companyId: 'comp-mfg',
    sku: 'PC-PRO',
    name: 'Pro Desktop PC',
    unitId: 'u-pc-mfg',
  })
  await invService.registerWarehouse({
    id: 'wh-factory',
    companyId: 'comp-mfg',
    organizationUnitId: 'org-mfg',
    code: 'WH-FACT',
    name: 'Factory WH',
  })

  // Stock raw materials: 100 CPUs @ 5,000 minor, 100 Cases @ 2,000 minor
  await invService.recordMovement({
    id: 'mov-init-cpu',
    companyId: 'comp-mfg',
    itemId: 'item-cpu',
    warehouseId: 'wh-factory',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'init-cpu',
    quantityDelta: 100n,
    unitCostMinorUnits: 5000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })
  await invService.recordMovement({
    id: 'mov-init-case',
    companyId: 'comp-mfg',
    itemId: 'item-case',
    warehouseId: 'wh-factory',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'init-case',
    quantityDelta: 100n,
    unitCostMinorUnits: 2000n,
    currency: 'TWD',
    occurredAt: new Date(),
  })

  // 2. Register BOM via Controller

  const bomRes = await call(mfgCtrl.registerBom(), {
    id: 'bom-pc-01',
    companyId: 'comp-mfg',
    parentItemId: 'item-pc-complete',
    code: 'BOM-PC-PRO',
    name: 'Pro PC Assembly BOM',
    baseQuantity: null,
    lines: [
      {
        componentItemId: 'item-cpu',
        quantityPerBase: '1',
        scrapPercentageBasisPoints: null,
        memo: null,
      },
      {
        componentItemId: 'item-case',
        quantityPerBase: '1',
        scrapPercentageBasisPoints: 500, // 5% scrap
        memo: null,
      },
    ],
  })

  const bomPayload = bomRes
  assert.equal(bomPayload.code, 'BOM-PC-PRO')
  assert.equal(bomPayload.baseQuantity, '1')
  assert.equal(bomPayload.lines.length, 2)
  assert.equal(bomPayload.lines[0].scrapPercentageBasisPoints, 0)
  assert.equal(bomPayload.lines[0].memo, undefined)
  assert.doesNotThrow(() => JSON.stringify(bomPayload))

  // 3. Query BOM via Controller

  const getBomRes = await call(mfgCtrl.getBom(), { id: 'bom-pc-01' })

  assert.equal(getBomRes.id, 'bom-pc-01')

  // 4. Create Work Order for 10 units via Controller

  const woRes = await call(mfgCtrl.createWorkOrder(), {
    id: 'wo-mfg-01',
    companyId: 'comp-mfg',
    workOrderNumber: 'WO-2026-001',
    bomId: 'bom-pc-01',
    outputWarehouseId: 'wh-factory',
    rawMaterialWarehouseId: 'wh-factory',
    targetQuantity: '10',
    memo: null,
  })

  const woPayload = woRes
  assert.equal(woPayload.status, 'DRAFT')
  assert.equal(woPayload.targetQuantity, '10')
  assert.equal(woPayload.memo, undefined)
  // Case has 5% scrap: ceil(10 * 1.05) = 11
  const caseLine = woPayload.lines.find((l) => l.componentItemId === 'item-case')
  assert.ok(caseLine)
  assert.equal(caseLine.plannedQuantity, '11')
  assert.doesNotThrow(() => JSON.stringify(woPayload))

  // 5. Release Work Order via Controller

  const relRes = await call(mfgCtrl.releaseWorkOrder(), { id: 'wo-mfg-01' })

  assert.equal(relRes.status, 'RELEASED')

  // 6. Issue Materials via Controller

  const issueRes = await call(mfgCtrl.issueMaterials(), {
    id: 'wo-mfg-01',
    ...{
      issueDate: '2026-09-10',
      lines: [
        { componentItemId: 'item-cpu', quantity: '10' },
        { componentItemId: 'item-case', quantity: '11' },
      ],
    },
  })

  const issuePayload = issueRes
  assert.equal(issuePayload.status, 'IN_PROGRESS')
  // Total direct material cost: 10 * 5,000 + 11 * 2,000 = 50,000 + 22,000 = 72,000 minor
  assert.equal(issuePayload.actualDirectMaterialCostMinorUnits, '72000')
  assert.doesNotThrow(() => JSON.stringify(issuePayload))

  // Verify stock was deducted
  const cpuStock = await invService.stock('comp-mfg', 'item-cpu', 'wh-factory')
  assert.equal(cpuStock.isOk && cpuStock.value.quantity, 90n)

  // 7. Complete Work Order via Controller

  const compRes = await call(mfgCtrl.completeWorkOrder(), {
    id: 'wo-mfg-01',
    ...{
      completedQuantity: '10',
      completionDate: '2026-09-10',
    },
  })

  const compPayload = compRes
  assert.equal(compPayload.status, 'COMPLETED')
  assert.equal(compPayload.completedQuantity, '10')
  assert.equal(compPayload.totalCostMinorUnits, '72000')
  assert.equal(compPayload.unitCostMinorUnits, '7200') // 72,000 / 10
  assert.doesNotThrow(() => JSON.stringify(compPayload))

  // Verify finished goods stock was added: 10 units @ 7,200 minor
  const fgStock = await invService.stock('comp-mfg', 'item-pc-complete', 'wh-factory')
  assert.equal(fgStock.isOk && fgStock.value.quantity, 10n)
  assert.equal(fgStock.isOk && fgStock.value.averageUnitCostMinorUnits, 7200n)

  // 8. Allocate Overheads via Controller

  const allocRes = await call(mfgCtrl.allocateOverhead(), {
    companyId: 'comp-mfg',
    workOrderIds: ['wo-mfg-01'],
    totalPoolAmountMinorUnits: '8000', // 80.00 TWD
    currency: 'twd',
    overheadAccount: null,
    accountingDate: '2026-09-10',
    allocationBase: 'COMPLETED_QUANTITY',
  })

  const allocPayload = allocRes
  assert.equal(allocPayload.totalPoolAmountMinorUnits, '8000')
  assert.equal(allocPayload.allocations.length, 1)
  assert.equal(allocPayload.allocations[0].allocatedAmountMinorUnits, '8000')
  assert.equal(allocPayload.allocations[0].newTotalCostMinorUnits, '80000') // 72,000 + 8,000 = 80,000
  assert.equal(allocPayload.allocations[0].newUnitCostMinorUnits, '8000') // 80,000 / 10
  assert.doesNotThrow(() => JSON.stringify(allocPayload))
})

test('procedures validate query values, nested inputs and unknown request fields', async () => {
  const sales = new SalesController(new InMemorySalesService())
  await assert.rejects(
    call(sales.checkCredit(), { id: 'customer', additionalAmount: 'not-an-integer' }),
    { code: 'BAD_REQUEST', status: 400 }
  )
  const unknownInput = {
    id: 'order',
    companyId: 'company',
    customerId: 'customer',
    number: 'SO-1',
    bypassCreditCheck: true,
    lines: [
      {
        itemId: 'item',
        warehouseId: 'warehouse',
        orderedQuantity: '1',
        unitPriceMinorUnits: '10',
        currency: 'TWD',
      },
    ],
  }
  await assert.rejects(call(sales.createSalesOrder(), unknownInput), {
    code: 'BAD_REQUEST',
    status: 400,
  })
  const unknownLine = {
    id: 'order',
    companyId: 'company',
    customerId: 'customer',
    number: 'SO-1',
    lines: [
      {
        itemId: 'item',
        warehouseId: 'warehouse',
        orderedQuantity: '1',
        unitPriceMinorUnits: '10',
        currency: 'TWD',
        totalOverride: '0',
      },
    ],
  }
  await assert.rejects(call(sales.createSalesOrder(), unknownLine), {
    code: 'BAD_REQUEST',
    status: 400,
  })
  await assert.rejects(
    call(sales.createShipment(), {
      id: 'shipment',
      salesOrderId: 'order',
      warehouseId: 'warehouse',
      shipmentDate: '2026-02-30',
    }),
    { code: 'BAD_REQUEST', status: 400 }
  )

  const identity = new IdentityController(new InMemoryIdentityService())
  const privateFixtureField = {
    id: 'user',
    username: 'user',
    displayName: 'User',
    password: 'correct horse battery staple',
    passwordHash: 'fixture-only',
  }
  await assert.rejects(call(identity.register(), privateFixtureField), {
    code: 'BAD_REQUEST',
    status: 400,
  })
})

test('procedures expose validated monetary error data and preserve custom error codes', async () => {
  const sales = new SalesController(new InMemorySalesService())
  await call(sales.registerCustomer(), {
    id: 'customer',
    companyId: 'company',
    code: 'C1',
    name: 'Customer',
    currency: 'TWD',
    creditLimitMinorUnits: '100',
  })
  await call(sales.createSalesOrder(), {
    id: 'order',
    companyId: 'company',
    customerId: 'customer',
    number: 'SO-1',
    lines: [
      {
        itemId: 'item',
        warehouseId: 'warehouse',
        orderedQuantity: '100',
        unitPriceMinorUnits: '2',
        currency: 'TWD',
      },
    ],
  })
  await assert.rejects(call(sales.confirmOrder(), { id: 'order' }), (error: unknown) => {
    assert.ok(error instanceof ORPCError)
    assert.equal(error.code, 'CREDIT_LIMIT_EXCEEDED')
    assert.equal(error.status, 422)
    assert.equal(error.defined, true)
    assert.deepEqual(error.data, {
      customerId: 'customer',
      creditLimitMinorUnits: '100',
      currentOutstandingMinorUnits: '0',
      pendingOrdersMinorUnits: '0',
      requestedOrderAmountMinorUnits: '210',
      excessMinorUnits: '110',
    })
    return true
  })

  const treasury = new TreasuryController(new InMemoryTreasuryService())
  await call(treasury.registerBankAccount(), {
    id: 'bank',
    companyId: 'company',
    accountNumber: '123',
    bankCode: '004',
    bankName: 'Bank',
    accountName: 'Business',
    glAccountId: 'gl',
    currency: 'TWD',
    initialBalanceMinorUnits: '5',
  })
  await call(treasury.createPayment(), {
    id: 'payment',
    companyId: 'company',
    bankAccountId: 'bank',
    paymentNumber: 'PMT-1',
    paymentDate: '2026-10-08',
    beneficiaryType: 'OTHER',
    beneficiaryId: 'other',
    amountMinorUnits: '10',
  })
  await assert.rejects(call(treasury.postPayment(), { id: 'payment' }), {
    code: 'INSUFFICIENT_FUNDS',
    status: 422,
    defined: true,
    data: { accountId: 'bank', currentBalanceMinorUnits: '5', requestedAmountMinorUnits: '10' },
  })
})

test('procurement approval uses verified request roles and rejects forged approver fields', async () => {
  const procurement = new ProcurementController(new InMemoryProcurementService())
  await call(procurement.registerSupplier(), {
    id: 'supplier',
    companyId: 'company',
    code: 'S1',
    name: 'Supplier',
  })
  await call(procurement.createPO(), {
    id: 'order',
    companyId: 'company',
    supplierId: 'supplier',
    number: 'PO-1',
    lines: [{ itemId: 'item', orderedQuantity: '1', unitCostMinorUnits: '10', currency: 'TWD' }],
  })
  const unauthorizedRequest = { user: { ...approverRequest.user, roles: ['ADMIN'] } }
  await assert.rejects(
    call(procurement.approvePO(unauthorizedRequest), { id: 'order', expectedStepId: 'mgr-review' }),
    {
      code: 'UNAUTHORIZED_APPROVER',
      defined: true,
    }
  )
  const forgedInput = {
    id: 'order',
    expectedStepId: 'mgr-review',
    actorId: 'forged',
    roles: ['MANAGER'],
  }
  await assert.rejects(call(procurement.approvePO(approverRequest), forgedInput), {
    code: 'BAD_REQUEST',
    status: 400,
  })
  assert.equal(
    (
      await call(procurement.approvePO(approverRequest), {
        id: 'order',
        expectedStepId: 'mgr-review',
      })
    ).status,
    'APPROVED'
  )
})

test('procedures normalize optional null inputs and preserve nullable database snapshot fields', async () => {
  const salesService = new InMemorySalesService()
  const createOrder = salesService.createSalesOrder.bind(salesService)
  salesService.createSalesOrder = async (...args) =>
    (await createOrder(...args)).map((snapshot) => databaseNulls(snapshot, ['memo']))
  const ship = salesService.createShipment.bind(salesService)
  salesService.createShipment = async (...args) =>
    (await ship(...args)).map((snapshot) =>
      databaseNulls(snapshot, ['arJournalEntryId', 'cogsJournalEntryId'])
    )
  const sales = new SalesController(salesService)
  const customer = await call(sales.registerCustomer(), {
    id: 'null-customer',
    companyId: 'company',
    code: 'C-NULL',
    name: 'Customer',
    currency: 'TWD',
    creditLimitMinorUnits: '1000',
    paymentTerms: null,
  })
  assert.equal(customer.paymentTerms, 'NET30')
  const order = await call(sales.createSalesOrder(), {
    id: 'null-order',
    companyId: 'company',
    customerId: customer.id,
    number: 'SO-NULL',
    memo: null,
    taxRateBasisPoints: null,
    lines: [
      {
        itemId: 'item',
        warehouseId: 'warehouse',
        orderedQuantity: '1',
        unitPriceMinorUnits: '100',
        currency: 'TWD',
      },
    ],
  })
  assert.equal(order.memo, null)
  assert.equal(order.taxRateBasisPoints, 500)
  await call(sales.confirmOrder(), { id: order.id })
  const shipment = await call(sales.createShipment(), {
    id: 'null-shipment',
    salesOrderId: order.id,
    warehouseId: 'warehouse',
    shipmentDate: '2026-10-08',
    arVoucherId: null,
    cogsVoucherId: null,
    lines: null,
  })
  assert.equal(shipment.arJournalEntryId, null)
  assert.equal(shipment.cogsJournalEntryId, null)

  const procurementService = new InMemoryProcurementService()
  const createRequisition = procurementService.createRequisition.bind(procurementService)
  procurementService.createRequisition = async (...args) =>
    (await createRequisition(...args)).map((snapshot) =>
      databaseNulls(snapshot, ['memo', 'convertedPurchaseOrderId'])
    )
  const registerInvoice = procurementService.registerVendorInvoice.bind(procurementService)
  procurementService.registerVendorInvoice = async (...args) =>
    (await registerInvoice(...args)).map((snapshot) =>
      databaseNulls(snapshot, ['matchedAt', 'journalEntryId'])
    )
  const procurement = new ProcurementController(procurementService)
  const requisition = await call(procurement.createRequisition(), {
    id: 'null-pr',
    companyId: 'company',
    requesterId: 'requester',
    number: 'PR-NULL',
    memo: null,
    lines: [
      { itemId: 'item', requestedQuantity: '1', estimatedCostMinorUnits: '100', currency: 'TWD' },
    ],
  })
  assert.equal(requisition.memo, null)
  assert.equal(requisition.convertedPurchaseOrderId, null)
  await call(procurement.registerSupplier(), {
    id: 'null-supplier',
    companyId: 'company',
    code: 'S-NULL',
    name: 'Supplier',
  })
  await call(procurement.createPO(), {
    id: 'null-po',
    companyId: 'company',
    supplierId: 'null-supplier',
    number: 'PO-NULL',
    lines: [{ itemId: 'item', orderedQuantity: '1', unitCostMinorUnits: '100', currency: 'TWD' }],
  })
  const invoice = await call(procurement.registerInvoice(), {
    id: 'null-invoice',
    companyId: 'company',
    supplierId: 'null-supplier',
    purchaseOrderId: 'null-po',
    invoiceNumber: 'INV-NULL',
    invoiceDate: '2026-10-08',
    currency: 'TWD',
    taxRateBasisPoints: null,
    lines: [{ itemId: 'item', invoicedQuantity: '1', unitPriceMinorUnits: '100' }],
  })
  assert.equal(invoice.taxRateBasisPoints, 500)
  assert.equal(invoice.matchedAt, null)
  assert.equal(invoice.journalEntryId, null)

  const treasuryService = new InMemoryTreasuryService()
  const createPayment = treasuryService.createPayment.bind(treasuryService)
  treasuryService.createPayment = async (...args) =>
    (await createPayment(...args)).map((snapshot) =>
      databaseNulls(
        {
          ...snapshot,
          lines: snapshot.lines.map((line) => databaseNulls(line, ['memo'])),
        },
        ['memo', 'journalEntryId', 'postedAt']
      )
    )
  const createReceipt = treasuryService.createReceipt.bind(treasuryService)
  treasuryService.createReceipt = async (...args) =>
    (await createReceipt(...args)).map((snapshot) =>
      databaseNulls(
        {
          ...snapshot,
          lines: snapshot.lines.map((line) => databaseNulls(line, ['memo'])),
        },
        ['memo', 'journalEntryId', 'postedAt']
      )
    )
  const importStatement = treasuryService.importBankStatement.bind(treasuryService)
  treasuryService.importBankStatement = async (...args) =>
    (await importStatement(...args)).map((snapshot) => ({
      ...snapshot,
      lines: snapshot.lines.map((line) => databaseNulls(line, ['description', 'matchedVoucherId'])),
    }))
  const treasury = new TreasuryController(treasuryService)
  const bank = await call(treasury.registerBankAccount(), {
    id: 'null-bank',
    companyId: 'company',
    accountNumber: '123',
    bankCode: '004',
    bankName: 'Bank',
    accountName: 'Business',
    glAccountId: 'gl',
    currency: null,
    initialBalanceMinorUnits: null,
  })
  assert.equal(bank.currency, 'TWD')
  assert.equal(bank.currentBalanceMinorUnits, '0')
  const payment = await call(treasury.createPayment(), {
    id: 'null-payment',
    companyId: 'company',
    bankAccountId: bank.id,
    paymentNumber: 'PMT-NULL',
    paymentDate: '2026-10-08',
    beneficiaryType: 'OTHER',
    beneficiaryId: 'other',
    amountMinorUnits: '100',
    currency: null,
    glPayableAccountId: null,
    memo: null,
    lines: [{ invoiceId: 'invoice', appliedAmountMinorUnits: '100', memo: null }],
  })
  assert.equal(payment.currency, 'TWD')
  assert.equal(payment.memo, null)
  assert.equal(payment.lines[0].memo, null)
  assert.equal(payment.journalEntryId, null)
  assert.equal(payment.postedAt, null)
  const receipt = await call(treasury.createReceipt(), {
    id: 'null-receipt',
    companyId: 'company',
    bankAccountId: bank.id,
    receiptNumber: 'RCP-NULL',
    receiptDate: '2026-10-08',
    payerType: 'OTHER',
    payerId: 'other',
    amountMinorUnits: '100',
    currency: null,
    glReceivableAccountId: null,
    memo: null,
    lines: [{ referenceId: 'reference', appliedAmountMinorUnits: '100', memo: null }],
  })
  assert.equal(receipt.memo, null)
  assert.equal(receipt.lines[0].memo, null)
  assert.equal(receipt.journalEntryId, null)
  assert.equal(receipt.postedAt, null)
  const statement = await call(treasury.importBankStatement(), {
    id: 'null-statement',
    bankAccountId: bank.id,
    statementNumber: 'ST-NULL',
    statementDate: '2026-10-08',
    openingBalanceMinorUnits: '0',
    closingBalanceMinorUnits: '100',
    lines: [
      {
        id: 'null-line',
        transactionDate: '2026-10-08',
        direction: 'CREDIT',
        amountMinorUnits: '100',
        reference: 'reference',
        description: null,
      },
    ],
  })
  assert.equal(statement.lines[0].description, null)
  assert.equal(statement.lines[0].matchedVoucherId, null)
})

test('purchase orders expose the pending step and reject a repeated manager request', async () => {
  const controller = new ProcurementController(new InMemoryProcurementService())
  await call(controller.registerSupplier(), {
    id: 'step-supplier',
    companyId: 'company',
    code: 'STEP',
    name: 'Supplier',
  })
  const created = await call(controller.createPO(), {
    id: 'step-po',
    companyId: 'company',
    supplierId: 'step-supplier',
    number: 'PO-STEP',
    lines: [
      { itemId: 'item', orderedQuantity: '1', unitCostMinorUnits: '100000', currency: 'TWD' },
    ],
  })
  assert.equal(created.approval?.currentStepId, 'mgr-review')
  const dualRole = { user: { ...approverRequest.user, roles: ['ADMIN', 'MANAGER', 'DIRECTOR'] } }
  const managerInput = { id: created.id, expectedStepId: 'mgr-review', comment: 'Reviewed cost' }
  const pending = await call(controller.approvePO(dualRole), managerInput)
  assert.equal(pending.status, 'DRAFT')
  assert.equal(pending.approval?.currentStepId, 'director-review')
  assert.equal(pending.approval?.history[0]?.comment, managerInput.comment)
  await assert.rejects(call(controller.approvePO(dualRole), managerInput), {
    code: 'INVALID_APPROVAL_STEP',
    status: 409,
    defined: true,
  })
  const loaded = await call(controller.getPO(), { id: created.id })
  assert.deepEqual(loaded, pending)
  const director = { user: { ...approverRequest.user, id: 'director-1', roles: ['DIRECTOR'] } }
  const approved = await call(controller.approvePO(director), {
    id: created.id,
    expectedStepId: loaded.approval!.currentStepId!,
  })
  assert.equal(approved.status, 'APPROVED')
  assert.equal(approved.approval?.currentStepId, null)
  assert.deepEqual(
    approved.approval?.history.map((record) => record.approverId),
    ['manager-1', 'director-1']
  )
})
