import assert from 'node:assert/strict'
import { test } from 'vitest'
import { AppController } from '../../../src/app.controller.js'
import { ResultPresenter, serializeBigInt } from '@platform/http/index.js'
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
import { InMemorySalesService } from '@modules/sales/services/in_memory_sales_service.js'
import { SalesController } from '@modules/sales/controllers/sales.controller.js'
import { InMemoryTreasuryService } from '@modules/treasury/services/in_memory_treasury_service.js'
import { TreasuryController } from '@modules/treasury/controllers/treasury.controller.js'
import { InMemoryManufacturingService } from '@modules/manufacturing/services/in_memory_manufacturing_service.js'
import { ManufacturingController } from '@modules/manufacturing/controllers/manufacturing.controller.js'

function createMockResponse() {
  let statusCode = 200
  let payload: unknown = null
  const res = {
    status(code: number) {
      statusCode = code
      return {
        send(body: unknown) {
          payload = body
          return res
        },
        json(body: unknown) {
          payload = body
          return res
        },
      }
    },
    send(body: unknown) {
      payload = body
      return res
    },
    json(body: unknown) {
      payload = body
      return res
    },
    getStatusCode: () => statusCode,
    getPayload: () => payload,
  }
  return res
}

test('AppController returns service health status', () => {
  const controller = new AppController()
  const health = controller.getHealth()
  assert.deepEqual(health, { service: 'flash-erp', status: 'ok' })
})

test('serializeBigInt safely converts BigInt primitives to strings for JSON serialization', () => {
  const input = {
    id: 'entry-1',
    amount: 1000000000000000000n,
    nested: {
      qty: 42n,
      label: 'test',
    },
    list: [1n, 2n, 3n],
  }

  const serialized = serializeBigInt(input)
  // Must be valid JSON without throwing "Do not know how to serialize a BigInt"
  const json = JSON.stringify(serialized)
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), {
    id: 'entry-1',
    amount: '1000000000000000000',
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
  const mockRes = createMockResponse()

  await controller.register(
    { id: 'comp-1', code: 'ACME', name: 'Acme Corp', kind: 'COMPANY' },
    mockRes as any
  )
  assert.equal(mockRes.getStatusCode(), 201)
  assert.equal((mockRes.getPayload() as any).code, 'ACME')

  const findRes = createMockResponse()
  await controller.find('comp-1', findRes as any)
  assert.equal(findRes.getStatusCode(), 200)
  assert.equal((findRes.getPayload() as any).id, 'comp-1')

  // Register plant under company
  const plantRes = createMockResponse()
  await controller.register(
    { id: 'plant-1', code: 'PLANT-1', name: 'Plant 1', kind: 'PLANT', parentId: 'comp-1' },
    plantRes as any
  )
  assert.equal(plantRes.getStatusCode(), 201)

  // Error case: invalid parent
  const errRes = createMockResponse()
  await controller.register(
    { id: 'wh-bad', code: 'WH-BAD', name: 'Bad WH', kind: 'WAREHOUSE', parentId: 'comp-1' },
    errRes as any
  )
  assert.equal(errRes.getStatusCode(), 422)
})

test('IdentityController registers local users and maps conflict status', async () => {
  const identityService = new InMemoryIdentityService()
  const controller = new IdentityController(identityService)
  const res1 = createMockResponse()

  await controller.register(
    { id: 'u1', username: 'carol', displayName: 'Carol Danvers', passwordHash: 'hash123' },
    res1 as any
  )
  assert.equal(res1.getStatusCode(), 201)
  assert.equal((res1.getPayload() as any).username, 'carol')

  // Duplicate registration returns 409 Conflict
  const res2 = createMockResponse()
  await controller.register(
    { id: 'u2', username: 'carol', displayName: 'Carol 2', passwordHash: 'hash456' },
    res2 as any
  )
  assert.equal(res2.getStatusCode(), 409)
})

test('Inventory controllers safely serialize BigInt fields across movements and stock query', async () => {
  const invService = new InMemoryInventoryService()
  const masterCtrl = new InventoryMasterController(invService)
  const movCtrl = new InventoryMovementsController(invService)

  const uRes = createMockResponse()
  await masterCtrl.unit({ id: 'u-kg', code: 'KG', name: 'Kilograms' }, uRes as any)
  assert.equal(uRes.getStatusCode(), 201)

  const iRes = createMockResponse()
  await masterCtrl.item(
    { id: 'item-steel', companyId: 'comp-1', sku: 'STEEL-01', name: 'Steel', unitId: 'u-kg' },
    iRes as any
  )
  assert.equal(iRes.getStatusCode(), 201)

  const wRes = createMockResponse()
  await masterCtrl.warehouse(
    {
      id: 'wh-main',
      companyId: 'comp-1',
      organizationUnitId: 'org-wh-1',
      code: 'MAIN',
      name: 'Main',
    },
    wRes as any
  )
  assert.equal(wRes.getStatusCode(), 201)

  // Inbound movement: quantityDelta: 50, unitCostMinorUnits: 2000
  const mRes = createMockResponse()
  await movCtrl.store(
    {
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
    },
    mRes as any
  )
  assert.equal(mRes.getStatusCode(), 201)
  // Ensure payload BigInts are safely serialized to strings
  const mPayload = mRes.getPayload() as any
  assert.equal(typeof mPayload.quantityDelta, 'string')
  assert.equal(typeof mPayload.unitCostMinorUnits, 'string')
  assert.doesNotThrow(() => JSON.stringify(mPayload))

  // Show stock
  const sRes = createMockResponse()
  await movCtrl.showStock('comp-1', 'item-steel', 'wh-main', sRes as any)
  assert.equal(sRes.getStatusCode(), 200)
  const sPayload = sRes.getPayload() as any
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
  const suppRes = createMockResponse()
  await procCtrl.registerSupplier(
    { id: 'supp-global', companyId: 'comp-1', code: 'SUPP-G', name: 'Global Tech' },
    suppRes as any
  )
  assert.equal(suppRes.getStatusCode(), 201)

  // Create PO
  const poRes = createMockResponse()
  await procCtrl.createPO(
    {
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
    },
    poRes as any
  )
  assert.equal(poRes.getStatusCode(), 201)
  const poPayload = poRes.getPayload() as any
  assert.equal(poPayload.status, 'DRAFT')
  assert.equal(poPayload.lines[0].orderedQuantity, '100')
  assert.doesNotThrow(() => JSON.stringify(poPayload))

  // Approve PO
  const appRes = createMockResponse()
  await procCtrl.approvePO('po-5001', appRes as any)
  assert.equal(appRes.getStatusCode(), 200)

  // Receive goods
  const grRes = createMockResponse()
  await procCtrl.receiveGoods(
    {
      id: 'gr-9001',
      purchaseOrderId: 'po-5001',
      warehouseId: 'wh-east',
      receivedAt: '2026-09-02T12:00:00.000Z',
    },
    grRes as any
  )
  assert.equal(grRes.getStatusCode(), 201)

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
  const suppRes = createMockResponse()
  await procCtrl.registerSupplier(
    { id: 'supp-ap-ctrl', companyId: 'comp-ctrl', code: 'SUPP-AC', name: 'AP Controller Supplier' },
    suppRes as any
  )
  assert.equal(suppRes.getStatusCode(), 201)

  // 2. PR creation, submit, approve, convert
  const prRes = createMockResponse()
  await procCtrl.createRequisition(
    {
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
    },
    prRes as any
  )
  assert.equal(prRes.getStatusCode(), 201)

  const submitRes = createMockResponse()
  await procCtrl.submitRequisition('pr-ctrl-1', submitRes as any)
  assert.equal(submitRes.getStatusCode(), 200)

  const approvePrRes = createMockResponse()
  await procCtrl.approveRequisition(
    'pr-ctrl-1',
    { comment: 'Approved by Director' },
    approvePrRes as any
  )
  assert.equal(approvePrRes.getStatusCode(), 200)

  const convertRes = createMockResponse()
  await procCtrl.convertRequisition(
    'pr-ctrl-1',
    {
      purchaseOrderId: 'po-ctrl-1',
      purchaseOrderNumber: 'PO-CTRL-001',
      supplierId: 'supp-ap-ctrl',
    },
    convertRes as any
  )
  assert.equal(convertRes.getStatusCode(), 201)

  // 3. Approve PO & Receive goods
  const poAppRes = createMockResponse()
  await procCtrl.approvePO('po-ctrl-1', poAppRes as any)
  assert.equal(poAppRes.getStatusCode(), 200)

  const grRes = createMockResponse()
  await procCtrl.receiveGoods(
    {
      id: 'gr-ctrl-1',
      purchaseOrderId: 'po-ctrl-1',
      warehouseId: 'wh-ctrl',
      receivedAt: '2026-09-10T12:00:00Z',
      lines: [{ itemId: 'item-monitor', receivedQuantity: '2' }],
    },
    grRes as any
  )
  assert.equal(grRes.getStatusCode(), 201)

  // 4. Register vendor invoice: 2 * 5,000 = 10,000 minor + 5% tax (500 minor) = 10,500 minor
  const invRes = createMockResponse()
  await procCtrl.registerInvoice(
    {
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
    },
    invRes as any
  )
  assert.equal(invRes.getStatusCode(), 201)
  const invPayload = invRes.getPayload() as any
  assert.equal(invPayload.status, 'RECEIVED')
  assert.equal(invPayload.netAmountMinorUnits, '10000')
  assert.equal(invPayload.taxAmountMinorUnits, '500')
  assert.equal(invPayload.totalAmountMinorUnits, '10500')
  assert.doesNotThrow(() => JSON.stringify(invPayload))

  // 5. Match invoice
  const matchRes = createMockResponse()
  await procCtrl.matchInvoice('inv-ctrl-1', {}, matchRes as any)
  assert.equal(matchRes.getStatusCode(), 200)
  const matchPayload = matchRes.getPayload() as any
  assert.equal(matchPayload.isMatched, true)
  assert.equal(matchPayload.status, 'MATCHED')

  // 6. Create AP Voucher
  const voucherRes = createMockResponse()
  await procCtrl.createApVoucher(
    'inv-ctrl-1',
    {
      voucherId: 'je-ctrl-ap-1',
      voucherNumber: 'JE-AP-CTRL-01',
      accountingDate: '2026-09-10',
      inventoryAccountId: 'acc-inv',
      taxAccountId: 'acc-tax',
      payableAccountId: 'acc-ap',
      memo: 'Test AP Voucher via Controller',
    },
    voucherRes as any
  )
  assert.equal(voucherRes.getStatusCode(), 201)
  const voucherPayload = voucherRes.getPayload() as any
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
  const custRes = createMockResponse()
  await salesCtrl.registerCustomer(
    {
      id: 'cust-ctrl-1',
      companyId: 'comp-sales',
      code: 'CUST-STORE-1',
      name: 'Retail Store 1',
      paymentTerms: 'NET30',
      currency: 'TWD',
      creditLimitMinorUnits: '500000', // 5,000 TWD
    },
    custRes as any
  )
  assert.equal(custRes.getStatusCode(), 201)
  const custPayload = custRes.getPayload() as any
  assert.equal(custPayload.code, 'CUST-STORE-1')
  assert.equal(custPayload.creditLimitMinorUnits, '500000')
  assert.doesNotThrow(() => JSON.stringify(custPayload))

  // 3. Check Credit via SalesController
  const creditRes = createMockResponse()
  await salesCtrl.checkCredit('cust-ctrl-1', '100000', creditRes as any)
  assert.equal(creditRes.getStatusCode(), 200)
  const creditPayload = creditRes.getPayload() as any
  assert.equal(creditPayload.isApproved, true)
  assert.equal(creditPayload.totalExposureMinorUnits, '100000')
  assert.doesNotThrow(() => JSON.stringify(creditPayload))

  // 4. Create Sales Order via SalesController
  const soRes = createMockResponse()
  await salesCtrl.createSalesOrder(
    {
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
    },
    soRes as any
  )
  assert.equal(soRes.getStatusCode(), 201)
  const soPayload = soRes.getPayload() as any
  assert.equal(soPayload.status, 'DRAFT')
  assert.equal(soPayload.netAmountMinorUnits, '15000')
  assert.equal(soPayload.taxAmountMinorUnits, '750')
  assert.equal(soPayload.totalAmountMinorUnits, '15750')
  assert.doesNotThrow(() => JSON.stringify(soPayload))

  // 5. Confirm Sales Order via SalesController (reserves ATP inventory stock)
  const confirmRes = createMockResponse()
  await salesCtrl.confirmOrder('so-ctrl-1', confirmRes as any)
  assert.equal(confirmRes.getStatusCode(), 200)
  const confirmPayload = confirmRes.getPayload() as any
  assert.equal(confirmPayload.status, 'CONFIRMED')
  assert.equal(confirmPayload.reservationIds.length, 1)
  assert.doesNotThrow(() => JSON.stringify(confirmPayload))

  // 6. Create Shipment via SalesController (deducts stock, releases reservation, creates AR/COGS vouchers)
  const shipRes = createMockResponse()
  await salesCtrl.createShipment(
    {
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
    },
    shipRes as any
  )
  assert.equal(shipRes.getStatusCode(), 201)
  const shipPayload = shipRes.getPayload() as any
  assert.equal(shipPayload.status, 'SHIPPED')
  assert.equal(shipPayload.totalShippedAmountMinorUnits, '15750')
  assert.doesNotThrow(() => JSON.stringify(shipPayload))
})

test('TreasuryController registers bank accounts, handles payments, receipts, and bank reconciliation', async () => {
  const finance = new InMemoryFinanceService()
  const treasury = new InMemoryTreasuryService(finance)
  const treasuryCtrl = new TreasuryController(treasury)

  // 1. Register Bank Account via TreasuryController
  const acctRes = createMockResponse()
  await treasuryCtrl.registerBankAccount(
    {
      id: 'bank-ctrl-01',
      companyId: 'comp-ctrl',
      accountNumber: '700-112233',
      bankCode: '700',
      bankName: 'Post Office Bank',
      accountName: 'Operating Account',
      currency: 'TWD',
      glAccountId: 'acc-1102-post',
      initialBalanceMinorUnits: '200000', // 2,000 TWD
    },
    acctRes as any
  )
  assert.equal(acctRes.getStatusCode(), 201)
  const acctPayload = acctRes.getPayload() as any
  assert.equal(acctPayload.accountNumber, '700-112233')
  assert.equal(acctPayload.currentBalanceMinorUnits, '200000')
  assert.doesNotThrow(() => JSON.stringify(acctPayload))

  // 2. Query Bank Account via TreasuryController
  const getAcctRes = createMockResponse()
  await treasuryCtrl.getBankAccount('bank-ctrl-01', getAcctRes as any)
  assert.equal(getAcctRes.getStatusCode(), 200)

  // 3. Create and Post Receipt via TreasuryController
  const rcptRes = createMockResponse()
  await treasuryCtrl.createReceipt(
    {
      id: 'rcpt-ctrl-01',
      companyId: 'comp-ctrl',
      bankAccountId: 'bank-ctrl-01',
      receiptNumber: 'RCPT-CTRL-01',
      receiptDate: '2026-09-10',
      payerType: 'CUSTOMER',
      payerId: 'cust-ctrl-1',
      amountMinorUnits: '50000',
    },
    rcptRes as any
  )
  assert.equal(rcptRes.getStatusCode(), 201)

  const postRcptRes = createMockResponse()
  await treasuryCtrl.postReceipt('rcpt-ctrl-01', postRcptRes as any)
  assert.equal(postRcptRes.getStatusCode(), 200)
  const postRcptPayload = postRcptRes.getPayload() as any
  assert.equal(postRcptPayload.status, 'POSTED')
  assert.doesNotThrow(() => JSON.stringify(postRcptPayload))

  // 4. Create and Post Payment via TreasuryController
  const pmtRes = createMockResponse()
  await treasuryCtrl.createPayment(
    {
      id: 'pmt-ctrl-01',
      companyId: 'comp-ctrl',
      bankAccountId: 'bank-ctrl-01',
      paymentNumber: 'PMT-CTRL-01',
      paymentDate: '2026-09-10',
      beneficiaryType: 'SUPPLIER',
      beneficiaryId: 'supp-ctrl-1',
      amountMinorUnits: '30000',
    },
    pmtRes as any
  )
  assert.equal(pmtRes.getStatusCode(), 201)

  const postPmtRes = createMockResponse()
  await treasuryCtrl.postPayment('pmt-ctrl-01', postPmtRes as any)
  assert.equal(postPmtRes.getStatusCode(), 200)
  const postPmtPayload = postPmtRes.getPayload() as any
  assert.equal(postPmtPayload.status, 'POSTED')
  assert.doesNotThrow(() => JSON.stringify(postPmtPayload))

  // 5. Import and Reconcile Bank Statement via TreasuryController
  // Current bank balance: 200,000 + 50,000 - 30,000 = 220,000
  const stmtRes = createMockResponse()
  await treasuryCtrl.importBankStatement(
    {
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
    },
    stmtRes as any
  )
  assert.equal(stmtRes.getStatusCode(), 201)

  const reconRes = createMockResponse()
  await treasuryCtrl.reconcileBankStatement('stmt-ctrl-01', reconRes as any)
  assert.equal(reconRes.getStatusCode(), 200)
  const reconPayload = reconRes.getPayload() as any
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
  const bomRes = createMockResponse()
  await mfgCtrl.registerBom(
    {
      id: 'bom-pc-01',
      companyId: 'comp-mfg',
      parentItemId: 'item-pc-complete',
      code: 'BOM-PC-PRO',
      name: 'Pro PC Assembly BOM',
      baseQuantity: '1',
      lines: [
        {
          componentItemId: 'item-cpu',
          quantityPerBase: '1',
          scrapPercentageBasisPoints: 0,
        },
        {
          componentItemId: 'item-case',
          quantityPerBase: '1',
          scrapPercentageBasisPoints: 500, // 5% scrap
        },
      ],
    },
    bomRes as any
  )
  assert.equal(bomRes.getStatusCode(), 201)
  const bomPayload = bomRes.getPayload() as any
  assert.equal(bomPayload.code, 'BOM-PC-PRO')
  assert.equal(bomPayload.baseQuantity, '1')
  assert.equal(bomPayload.lines.length, 2)
  assert.doesNotThrow(() => JSON.stringify(bomPayload))

  // 3. Query BOM via Controller
  const getBomRes = createMockResponse()
  await mfgCtrl.getBom('bom-pc-01', getBomRes as any)
  assert.equal(getBomRes.getStatusCode(), 200)
  assert.equal((getBomRes.getPayload() as any).id, 'bom-pc-01')

  // 4. Create Work Order for 10 units via Controller
  const woRes = createMockResponse()
  await mfgCtrl.createWorkOrder(
    {
      id: 'wo-mfg-01',
      companyId: 'comp-mfg',
      workOrderNumber: 'WO-2026-001',
      bomId: 'bom-pc-01',
      outputWarehouseId: 'wh-factory',
      rawMaterialWarehouseId: 'wh-factory',
      targetQuantity: '10',
      memo: 'Batch 1',
    },
    woRes as any
  )
  assert.equal(woRes.getStatusCode(), 201)
  const woPayload = woRes.getPayload() as any
  assert.equal(woPayload.status, 'DRAFT')
  assert.equal(woPayload.targetQuantity, '10')
  // Case has 5% scrap: ceil(10 * 1.05) = 11
  const caseLine = woPayload.lines.find((l: any) => l.componentItemId === 'item-case')
  assert.equal(caseLine.plannedQuantity, '11')
  assert.doesNotThrow(() => JSON.stringify(woPayload))

  // 5. Release Work Order via Controller
  const relRes = createMockResponse()
  await mfgCtrl.releaseWorkOrder('wo-mfg-01', relRes as any)
  assert.equal(relRes.getStatusCode(), 200)
  assert.equal((relRes.getPayload() as any).status, 'RELEASED')

  // 6. Issue Materials via Controller
  const issueRes = createMockResponse()
  await mfgCtrl.issueMaterials(
    'wo-mfg-01',
    {
      issueDate: '2026-09-10',
      lines: [
        { componentItemId: 'item-cpu', quantity: '10' },
        { componentItemId: 'item-case', quantity: '11' },
      ],
    },
    issueRes as any
  )
  assert.equal(issueRes.getStatusCode(), 200)
  const issuePayload = issueRes.getPayload() as any
  assert.equal(issuePayload.status, 'IN_PROGRESS')
  // Total direct material cost: 10 * 5,000 + 11 * 2,000 = 50,000 + 22,000 = 72,000 minor
  assert.equal(issuePayload.actualDirectMaterialCostMinorUnits, '72000')
  assert.doesNotThrow(() => JSON.stringify(issuePayload))

  // Verify stock was deducted
  const cpuStock = await invService.stock('comp-mfg', 'item-cpu', 'wh-factory')
  assert.equal(cpuStock.isOk && cpuStock.value.quantity, 90n)

  // 7. Complete Work Order via Controller
  const compRes = createMockResponse()
  await mfgCtrl.completeWorkOrder(
    'wo-mfg-01',
    {
      completedQuantity: '10',
      completionDate: '2026-09-10',
    },
    compRes as any
  )
  assert.equal(compRes.getStatusCode(), 200)
  const compPayload = compRes.getPayload() as any
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
  const allocRes = createMockResponse()
  await mfgCtrl.allocateOverhead(
    {
      companyId: 'comp-mfg',
      workOrderIds: ['wo-mfg-01'],
      totalPoolAmountMinorUnits: '8000', // 80.00 TWD
      currency: 'TWD',
      accountingDate: '2026-09-10',
      allocationBase: 'COMPLETED_QUANTITY',
    },
    allocRes as any
  )
  assert.equal(allocRes.getStatusCode(), 200)
  const allocPayload = allocRes.getPayload() as any
  assert.equal(allocPayload.totalPoolAmountMinorUnits, '8000')
  assert.equal(allocPayload.allocations.length, 1)
  assert.equal(allocPayload.allocations[0].allocatedAmountMinorUnits, '8000')
  assert.equal(allocPayload.allocations[0].newTotalCostMinorUnits, '80000') // 72,000 + 8,000 = 80,000
  assert.equal(allocPayload.allocations[0].newUnitCostMinorUnits, '8000') // 80,000 / 10
  assert.doesNotThrow(() => JSON.stringify(allocPayload))
})
