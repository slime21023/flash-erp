import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import type { InventoryContract } from '@modules/inventory/contracts/index.js'
import type { FinanceContract, JournalLine } from '@modules/finance/contracts/index.js'
import {
  ApprovalPipeline,
  type ApprovalStep,
  type ApprovalError,
} from '@platform/workflow/index.js'
import {
  AccountsPayablePostingError,
  AccountsPayableVoucherCreatedEvent,
  GoodsReceivedEvent,
  InvalidPurchaseOrderStateError,
  InvalidPurchaseRequisitionStateError,
  InvalidVendorInvoiceStateError,
  MatchingToleranceExceededError,
  ProcurementContract,
  ProcurementError,
  PurchaseOrderApprovedEvent,
  PurchaseOrderNotFoundError,
  PurchaseRequisitionApprovedEvent,
  PurchaseRequisitionNotFoundError,
  SupplierAlreadyExistsError,
  SupplierNotFoundError,
  VendorInvoiceAlreadyExistsError,
  VendorInvoiceMatchedEvent,
  VendorInvoiceNotFoundError,
  type AccountsPayableVoucherSnapshot,
  type ApproverContext,
  type ConvertRequisitionToPurchaseOrderInput,
  type CreateApVoucherInput,
  type CreatePurchaseOrderInput,
  type CreatePurchaseRequisitionInput,
  type GoodsReceiptLineInput,
  type GoodsReceiptSnapshot,
  type MatchResultSnapshot,
  type PurchaseOrderSnapshot,
  type PurchaseRequisitionSnapshot,
  type ReceiveGoodsInput,
  type RegisterSupplierInput,
  type RegisterVendorInvoiceInput,
  type SupplierSnapshot,
  type ThreeWayMatchToleranceOptions,
  type VendorInvoiceSnapshot,
} from '../contracts/index.js'
import type { EventEmitter2 } from '@nestjs/event-emitter'
import { ThreeWayMatcher, calculateTaxAndTotal } from './three_way_matcher.js'

export class InMemoryProcurementService extends ProcurementContract {
  readonly #suppliers = new Map<string, SupplierSnapshot>()
  readonly #purchaseOrders = new Map<string, PurchaseOrderSnapshot>()
  readonly #goodsReceipts = new Map<string, GoodsReceiptSnapshot>()
  readonly #requisitions = new Map<string, PurchaseRequisitionSnapshot>()
  readonly #vendorInvoices = new Map<string, VendorInvoiceSnapshot>()
  readonly #poPipelines = new Map<string, ApprovalPipeline<{ totalAmount: bigint }>>()

  constructor(
    private readonly inventory?: InventoryContract,
    private readonly eventEmitter?: EventEmitter2,
    private readonly finance?: FinanceContract
  ) {
    super()
  }

  async registerSupplier(
    input: RegisterSupplierInput,
    _options?: TransactionOptions
  ): Promise<Result<SupplierSnapshot, ProcurementError | SupplierAlreadyExistsError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !companyId || !code || !name) {
      return err(new ProcurementError('Supplier fields are required'))
    }

    if (
      this.#suppliers.has(id) ||
      [...this.#suppliers.values()].some((s) => s.companyId === companyId && s.code === code)
    ) {
      return err(new SupplierAlreadyExistsError(code))
    }

    const supplier: SupplierSnapshot = Object.freeze({
      id,
      companyId,
      code,
      name,
      isActive: true,
    })

    this.#suppliers.set(id, supplier)
    return ok(supplier)
  }

  async createPurchaseOrder(
    input: CreatePurchaseOrderInput,
    options?: TransactionOptions
  ): Promise<Result<PurchaseOrderSnapshot, ProcurementError | SupplierNotFoundError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const supplierId = input.supplierId.trim()
    const number = input.number.trim()

    if (!id || !companyId || !supplierId || !number || input.lines.length === 0) {
      return err(new ProcurementError('Purchase order fields and at least one line are required'))
    }

    if (this.#purchaseOrders.has(id)) {
      return err(new ProcurementError(`Purchase order already exists: ${id}`))
    }

    const currencies = new Set(input.lines.map((line) => line.currency.trim().toUpperCase()))
    if (currencies.size !== 1 || !/^[A-Z]{3}$/.test([...currencies][0] ?? '')) {
      return err(new ProcurementError('All purchase order lines must use one currency'))
    }

    const lineKeys = new Set<string>()
    const lines = input.lines.map((line) => ({
      itemId: line.itemId.trim(),
      orderedQuantity: line.orderedQuantity,
      unitCostMinorUnits: line.unitCostMinorUnits,
      currency: line.currency.trim().toUpperCase(),
    }))
    for (const line of lines) {
      if (
        !line.itemId ||
        lineKeys.has(line.itemId) ||
        line.orderedQuantity <= 0n ||
        line.unitCostMinorUnits < 0n
      ) {
        return err(new ProcurementError('Invalid or duplicate purchase order line'))
      }
      lineKeys.add(line.itemId)
      if (this.inventory) {
        const itemRes = await this.inventory.findItem(companyId, line.itemId, options)
        if (itemRes.isErr) return err(new ProcurementError(itemRes.error.message))
      }
    }

    if (
      [...this.#purchaseOrders.values()].some(
        (po) => po.companyId === companyId && po.number === number
      )
    ) {
      return err(new ProcurementError(`Purchase order number already exists: ${number}`))
    }

    const supplier = this.#suppliers.get(supplierId)
    if (!supplier || !supplier.isActive || supplier.companyId !== companyId) {
      return err(new SupplierNotFoundError(supplierId))
    }

    const po: PurchaseOrderSnapshot = Object.freeze({
      id,
      companyId,
      supplierId,
      number,
      status: 'DRAFT',
      lines: Object.freeze(lines),
    })

    this.#purchaseOrders.set(id, po)
    return ok(po)
  }

  async approvePurchaseOrder(
    id: string,
    approver?: ApproverContext,
    _options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseOrderSnapshot,
      PurchaseOrderNotFoundError | InvalidPurchaseOrderStateError | ApprovalError
    >
  > {
    const po = this.#purchaseOrders.get(id)
    if (!po) {
      return err(new PurchaseOrderNotFoundError(id))
    }

    if (po.status !== 'DRAFT') {
      return err(new InvalidPurchaseOrderStateError(po.status, 'approve'))
    }

    if (approver) {
      const totalAmount = po.lines.reduce(
        (sum, line) => sum + line.orderedQuantity * line.unitCostMinorUnits,
        0n
      )
      let pipeline = this.#poPipelines.get(id)
      if (!pipeline) {
        const steps: ApprovalStep<{ totalAmount: bigint }>[] = [
          { id: 'mgr-review', name: 'Manager Review', requiredRole: 'MANAGER' },
          {
            id: 'director-review',
            name: 'Director Review',
            requiredRole: 'DIRECTOR',
            condition: (ctx) => ctx.totalAmount >= 100_000n,
          },
        ]
        pipeline = ApprovalPipeline.create(id, { totalAmount }, steps)
      }

      const approveRes = pipeline.approve(
        pipeline.currentStepId!,
        approver.actorId,
        approver.roles,
        approver.comment
      )
      if (approveRes.isErr) {
        return err(approveRes.error)
      }
      this.#poPipelines.set(id, approveRes.value)
      if (approveRes.value.status !== 'APPROVED') {
        return ok(po)
      }
    }

    const approved: PurchaseOrderSnapshot = Object.freeze({
      ...po,
      status: 'APPROVED',
    })

    this.#purchaseOrders.set(id, approved)
    this.eventEmitter?.emit(
      PurchaseOrderApprovedEvent.EVENT_NAME,
      new PurchaseOrderApprovedEvent(po.id, po.companyId, po.supplierId, new Date())
    )

    return ok(approved)
  }

  async receiveGoods(
    input: ReceiveGoodsInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      GoodsReceiptSnapshot,
      PurchaseOrderNotFoundError | InvalidPurchaseOrderStateError | ProcurementError
    >
  > {
    const receiptId = input.id.trim()
    const purchaseOrderId = input.purchaseOrderId.trim()
    const warehouseId = input.warehouseId.trim()
    if (!receiptId || !purchaseOrderId || !warehouseId) {
      return err(new ProcurementError('id, purchaseOrderId, and warehouseId are required'))
    }

    const po = this.#purchaseOrders.get(purchaseOrderId)
    if (!po) {
      return err(new PurchaseOrderNotFoundError(purchaseOrderId))
    }

    if (po.status !== 'APPROVED') {
      return err(new InvalidPurchaseOrderStateError(po.status, 'receive'))
    }

    if (this.#goodsReceipts.has(receiptId)) {
      return err(new ProcurementError(`Goods receipt already exists: ${receiptId}`))
    }

    if (this.inventory) {
      const warehouseRes = await this.inventory.findWarehouse(po.companyId, warehouseId, options)
      if (warehouseRes.isErr) return err(new ProcurementError(warehouseRes.error.message))
    }

    const poLinesByItem = new Map(po.lines.map((line) => [line.itemId, line]))
    const receivedByItem = new Map<string, bigint>()
    for (const receipt of this.#goodsReceipts.values()) {
      if (receipt.purchaseOrderId !== po.id) continue
      for (const line of receipt.lines) {
        receivedByItem.set(
          line.itemId,
          (receivedByItem.get(line.itemId) ?? 0n) + line.receivedQuantity
        )
      }
    }

    const receiptLines: readonly GoodsReceiptLineInput[] =
      input.lines && input.lines.length > 0
        ? Object.freeze(
            input.lines.map((line) => ({
              itemId: line.itemId.trim(),
              receivedQuantity: line.receivedQuantity,
            }))
          )
        : Object.freeze(
            po.lines
              .map((line) => ({
                itemId: line.itemId,
                receivedQuantity: line.orderedQuantity - (receivedByItem.get(line.itemId) ?? 0n),
              }))
              .filter((line) => line.receivedQuantity > 0n)
          )

    const receiptItemIds = new Set<string>()
    for (const line of receiptLines) {
      const poLine = poLinesByItem.get(line.itemId)
      const receivedQuantity = (receivedByItem.get(line.itemId) ?? 0n) + line.receivedQuantity
      if (
        !poLine ||
        receiptItemIds.has(line.itemId) ||
        line.receivedQuantity <= 0n ||
        receivedQuantity > poLine.orderedQuantity
      ) {
        return err(new ProcurementError(`Invalid or excessive goods receipt line: ${line.itemId}`))
      }
      receiptItemIds.add(line.itemId)
    }

    if (receiptLines.length === 0) {
      return err(new ProcurementError('No remaining purchase order quantity to receive'))
    }

    if (this.inventory) {
      for (const line of receiptLines) {
        const poLine = poLinesByItem.get(line.itemId)
        if (!poLine) return err(new ProcurementError(`Item ${line.itemId} is not on PO`))

        const movementRes = await this.inventory.recordMovement(
          {
            id: `mov-${receiptId}-${line.itemId}-${warehouseId}`,
            companyId: po.companyId,
            itemId: line.itemId,
            warehouseId,
            sourceType: 'GOODS_RECEIPT',
            sourceId: receiptId,
            quantityDelta: line.receivedQuantity,
            unitCostMinorUnits: poLine.unitCostMinorUnits,
            currency: poLine.currency,
            occurredAt: input.receivedAt,
          },
          options
        )
        if (movementRes.isErr) {
          return err(
            new ProcurementError(`Inventory movement failed: ${movementRes.error.message}`)
          )
        }
      }
    }

    const receipt: GoodsReceiptSnapshot = Object.freeze({
      id: receiptId,
      purchaseOrderId,
      warehouseId,
      receivedAt: input.receivedAt,
      lines: receiptLines,
    })
    this.#goodsReceipts.set(receiptId, receipt)

    this.eventEmitter?.emit(
      GoodsReceivedEvent.EVENT_NAME,
      new GoodsReceivedEvent(
        receipt.id,
        po.id,
        po.companyId,
        receipt.warehouseId,
        receipt.receivedAt
      )
    )

    return ok(receipt)
  }

  async createRequisition(
    input: CreatePurchaseRequisitionInput,
    _options?: TransactionOptions
  ): Promise<Result<PurchaseRequisitionSnapshot, ProcurementError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const requesterId = input.requesterId.trim()
    const number = input.number.trim()

    if (!id || !companyId || !requesterId || !number || input.lines.length === 0) {
      return err(
        new ProcurementError('Purchase requisition fields and at least one line are required')
      )
    }

    for (const line of input.lines) {
      if (line.requestedQuantity <= 0n || line.estimatedCostMinorUnits < 0n) {
        return err(new ProcurementError('Invalid requisition line quantity or estimated cost'))
      }
    }

    const pr: PurchaseRequisitionSnapshot = Object.freeze({
      id,
      companyId,
      requesterId,
      number,
      status: 'DRAFT',
      memo: input.memo,
      lines: Object.freeze([...input.lines]),
    })

    this.#requisitions.set(id, pr)
    return ok(pr)
  }

  async submitRequisition(
    id: string,
    _options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseRequisitionSnapshot,
      PurchaseRequisitionNotFoundError | InvalidPurchaseRequisitionStateError
    >
  > {
    const pr = this.#requisitions.get(id)
    if (!pr) {
      return err(new PurchaseRequisitionNotFoundError(id))
    }

    if (pr.status !== 'DRAFT') {
      return err(new InvalidPurchaseRequisitionStateError(pr.status, 'submit'))
    }

    const submitted: PurchaseRequisitionSnapshot = Object.freeze({
      ...pr,
      status: 'SUBMITTED',
    })

    this.#requisitions.set(id, submitted)
    return ok(submitted)
  }

  async approveRequisition(
    id: string,
    approver?: ApproverContext,
    _options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseRequisitionSnapshot,
      PurchaseRequisitionNotFoundError | InvalidPurchaseRequisitionStateError | ApprovalError
    >
  > {
    const pr = this.#requisitions.get(id)
    if (!pr) {
      return err(new PurchaseRequisitionNotFoundError(id))
    }

    if (pr.status !== 'SUBMITTED' && pr.status !== 'DRAFT') {
      return err(new InvalidPurchaseRequisitionStateError(pr.status, 'approve'))
    }

    if (approver && !approver.roles.some((r) => ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(r))) {
      return err(new ProcurementError('Only managers or directors can approve requisitions'))
    }

    const approved: PurchaseRequisitionSnapshot = Object.freeze({
      ...pr,
      status: 'APPROVED',
    })

    this.#requisitions.set(id, approved)
    this.eventEmitter?.emit(
      PurchaseRequisitionApprovedEvent.EVENT_NAME,
      new PurchaseRequisitionApprovedEvent(pr.id, pr.companyId, pr.requesterId, new Date())
    )

    return ok(approved)
  }

  async convertRequisitionToPurchaseOrder(
    requisitionId: string,
    input: ConvertRequisitionToPurchaseOrderInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseOrderSnapshot,
      | PurchaseRequisitionNotFoundError
      | InvalidPurchaseRequisitionStateError
      | SupplierNotFoundError
      | ProcurementError
    >
  > {
    const pr = this.#requisitions.get(requisitionId)
    if (!pr) {
      return err(new PurchaseRequisitionNotFoundError(requisitionId))
    }

    if (pr.status !== 'APPROVED') {
      return err(new InvalidPurchaseRequisitionStateError(pr.status, 'convert'))
    }

    const poLines = pr.lines.map((l) => ({
      itemId: l.itemId,
      orderedQuantity: l.requestedQuantity,
      unitCostMinorUnits: l.estimatedCostMinorUnits,
      currency: l.currency,
    }))

    const poRes = await this.createPurchaseOrder(
      {
        id: input.purchaseOrderId,
        companyId: pr.companyId,
        supplierId: input.supplierId,
        number: input.purchaseOrderNumber,
        lines: poLines,
      },
      options
    )

    if (poRes.isErr) {
      return err(poRes.error)
    }

    const converted: PurchaseRequisitionSnapshot = Object.freeze({
      ...pr,
      status: 'CONVERTED',
      convertedPurchaseOrderId: poRes.value.id,
    })

    this.#requisitions.set(requisitionId, converted)
    return ok(poRes.value)
  }

  async registerVendorInvoice(
    input: RegisterVendorInvoiceInput,
    _options?: TransactionOptions
  ): Promise<
    Result<
      VendorInvoiceSnapshot,
      | PurchaseOrderNotFoundError
      | SupplierNotFoundError
      | VendorInvoiceAlreadyExistsError
      | ProcurementError
    >
  > {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const supplierId = input.supplierId.trim()
    const purchaseOrderId = input.purchaseOrderId.trim()
    const invoiceNumber = input.invoiceNumber.trim()
    const invoiceDate = input.invoiceDate.trim()
    const currency = input.currency.trim().toUpperCase()
    const taxRateBps = input.taxRateBasisPoints ?? 500

    if (
      !id ||
      !companyId ||
      !supplierId ||
      !purchaseOrderId ||
      !invoiceNumber ||
      !invoiceDate ||
      input.lines.length === 0
    ) {
      return err(new ProcurementError('All invoice fields and at least one line are required'))
    }

    const supplier = this.#suppliers.get(supplierId)
    if (!supplier || !supplier.isActive || supplier.companyId !== companyId) {
      return err(new SupplierNotFoundError(supplierId))
    }

    const po = this.#purchaseOrders.get(purchaseOrderId)
    if (!po || po.companyId !== companyId) {
      return err(new PurchaseOrderNotFoundError(purchaseOrderId))
    }

    if (
      !/^[A-Z]{3}$/.test(currency) ||
      !Number.isInteger(taxRateBps) ||
      taxRateBps < 0 ||
      taxRateBps > 10_000
    ) {
      return err(new ProcurementError('Invoice currency or tax rate is invalid'))
    }

    if (
      this.#vendorInvoices.has(id) ||
      [...this.#vendorInvoices.values()].some(
        (inv) => inv.companyId === companyId && inv.invoiceNumber === invoiceNumber
      )
    ) {
      return err(new VendorInvoiceAlreadyExistsError(invoiceNumber))
    }

    const poLinesByItem = new Map(po.lines.map((line) => [line.itemId, line]))
    const invoiceItemIds = new Set<string>()
    const invoiceLines: VendorInvoiceSnapshot['lines'][number][] = []
    for (const line of input.lines) {
      const itemId = line.itemId.trim()
      const poLine = poLinesByItem.get(itemId)
      const expectedLineTotal = line.invoicedQuantity * line.unitPriceMinorUnits
      if (
        !poLine ||
        invoiceItemIds.has(itemId) ||
        line.invoicedQuantity <= 0n ||
        line.unitPriceMinorUnits < 0n ||
        (line.lineTotalMinorUnits !== undefined &&
          line.lineTotalMinorUnits !== expectedLineTotal) ||
        poLine.currency !== currency
      ) {
        return err(new ProcurementError(`Invalid vendor invoice line: ${itemId}`))
      }
      invoiceItemIds.add(itemId)
      invoiceLines.push({
        itemId,
        invoicedQuantity: line.invoicedQuantity,
        unitPriceMinorUnits: line.unitPriceMinorUnits,
        lineTotalMinorUnits: expectedLineTotal,
      })
    }

    const netAmountMinorUnits = invoiceLines.reduce(
      (sum, line) => sum + line.lineTotalMinorUnits,
      0n
    )
    const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(
      netAmountMinorUnits,
      taxRateBps
    )

    const invoice: VendorInvoiceSnapshot = Object.freeze({
      id,
      companyId,
      supplierId,
      purchaseOrderId,
      invoiceNumber,
      invoiceDate,
      currency,
      taxRateBasisPoints: taxRateBps,
      netAmountMinorUnits,
      taxAmountMinorUnits,
      totalAmountMinorUnits,
      status: 'RECEIVED',
      lines: Object.freeze(invoiceLines),
    })

    this.#vendorInvoices.set(id, invoice)
    return ok(invoice)
  }

  async matchVendorInvoice(
    invoiceId: string,
    tolerance?: ThreeWayMatchToleranceOptions,
    _options?: TransactionOptions
  ): Promise<
    Result<
      MatchResultSnapshot,
      | VendorInvoiceNotFoundError
      | PurchaseOrderNotFoundError
      | InvalidVendorInvoiceStateError
      | MatchingToleranceExceededError
      | ProcurementError
    >
  > {
    const invoice = this.#vendorInvoices.get(invoiceId)
    if (!invoice) {
      return err(new VendorInvoiceNotFoundError(invoiceId))
    }

    if (invoice.status !== 'RECEIVED' && invoice.status !== 'DISPUTED') {
      return err(new InvalidVendorInvoiceStateError(invoice.status, 'match'))
    }

    const po = this.#purchaseOrders.get(invoice.purchaseOrderId)
    if (!po) {
      return err(new PurchaseOrderNotFoundError(invoice.purchaseOrderId))
    }

    // Collect all receipt lines for this PO
    const relevantReceipts = [...this.#goodsReceipts.values()].filter(
      (r) => r.purchaseOrderId === po.id
    )
    const receiptLines: { itemId: string; receivedQuantity: bigint }[] = []
    for (const receipt of relevantReceipts) {
      for (const line of receipt.lines) {
        receiptLines.push({ itemId: line.itemId, receivedQuantity: line.receivedQuantity })
      }
    }

    const previouslyInvoicedByItem = new Map<string, bigint>()
    for (const priorInvoice of this.#vendorInvoices.values()) {
      if (
        priorInvoice.id === invoice.id ||
        priorInvoice.purchaseOrderId !== po.id ||
        (priorInvoice.status !== 'MATCHED' && priorInvoice.status !== 'POSTED')
      ) {
        continue
      }
      for (const line of priorInvoice.lines) {
        previouslyInvoicedByItem.set(
          line.itemId,
          (previouslyInvoicedByItem.get(line.itemId) ?? 0n) + line.invoicedQuantity
        )
      }
    }

    const matchRes = ThreeWayMatcher.match(
      po.lines,
      receiptLines,
      invoice,
      tolerance,
      previouslyInvoicedByItem
    )
    if (matchRes.isErr) {
      const disputedInvoice: VendorInvoiceSnapshot = Object.freeze({
        ...invoice,
        status: 'DISPUTED',
      })
      this.#vendorInvoices.set(invoiceId, disputedInvoice)
      return err(matchRes.error)
    }

    const matchedInvoice: VendorInvoiceSnapshot = Object.freeze({
      ...invoice,
      status: 'MATCHED',
      matchedAt: matchRes.value.matchedAt,
    })
    this.#vendorInvoices.set(invoiceId, matchedInvoice)

    this.eventEmitter?.emit(
      VendorInvoiceMatchedEvent.EVENT_NAME,
      new VendorInvoiceMatchedEvent(
        invoice.id,
        invoice.companyId,
        invoice.purchaseOrderId,
        matchRes.value.matchedAt
      )
    )

    return ok(matchRes.value)
  }

  async createAccountsPayableVoucher(
    input: CreateApVoucherInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      AccountsPayableVoucherSnapshot,
      VendorInvoiceNotFoundError | InvalidVendorInvoiceStateError | AccountsPayablePostingError
    >
  > {
    const invoice = this.#vendorInvoices.get(input.invoiceId)
    if (!invoice) {
      return err(new VendorInvoiceNotFoundError(input.invoiceId))
    }

    if (invoice.status !== 'MATCHED') {
      return err(new InvalidVendorInvoiceStateError(invoice.status, 'create AP voucher'))
    }

    const lines: JournalLine[] = []
    const invDebit = Money.fromMinorUnits(invoice.netAmountMinorUnits, invoice.currency)
    const zeroRes = Money.zero(invoice.currency)

    if (invDebit.isErr || zeroRes.isErr) {
      return err(new AccountsPayablePostingError('Failed to create inventory debit amount'))
    }
    const zeroMoney = zeroRes.value

    // 1. Debit: Inventory / Expense
    lines.push({
      accountId: input.inventoryAccountId ?? 'account-inventory',
      debit: invDebit.value,
      credit: zeroMoney,
      memo: `AP Inventory/Expense for invoice ${invoice.invoiceNumber}`,
    })

    // 2. Debit: Input Tax (if tax > 0)
    if (invoice.taxAmountMinorUnits > 0n) {
      const taxDebit = Money.fromMinorUnits(invoice.taxAmountMinorUnits, invoice.currency)
      if (taxDebit.isErr) {
        return err(new AccountsPayablePostingError('Failed to create input tax debit amount'))
      }
      lines.push({
        accountId: input.taxAccountId ?? 'account-tax-in',
        debit: taxDebit.value,
        credit: zeroMoney,
        memo: `AP Input Tax 5% for invoice ${invoice.invoiceNumber}`,
      })
    }

    // 3. Credit: Accounts Payable
    const apCredit = Money.fromMinorUnits(invoice.totalAmountMinorUnits, invoice.currency)
    if (apCredit.isErr) {
      return err(new AccountsPayablePostingError('Failed to create AP credit amount'))
    }
    lines.push({
      accountId: input.payableAccountId ?? 'account-ap',
      debit: zeroMoney,
      credit: apCredit.value,
      memo: `AP Vendor Payable for invoice ${invoice.invoiceNumber}`,
    })

    if (this.finance) {
      const draftRes = await this.finance.createDraft(
        {
          id: input.voucherId,
          companyId: invoice.companyId,
          number: input.voucherNumber,
          accountingDate: input.accountingDate,
          memo: input.memo ?? `AP Voucher for invoice ${invoice.invoiceNumber}`,
          lines,
        },
        options
      )

      if (draftRes.isErr) {
        return err(
          new AccountsPayablePostingError(`Finance createDraft failed: ${draftRes.error.message}`)
        )
      }

      const postRes = await this.finance.postDraft(input.voucherId, undefined, options)
      if (postRes.isErr) {
        return err(
          new AccountsPayablePostingError(`Finance posting failed: ${postRes.error.message}`)
        )
      }
    }

    const postedInvoice: VendorInvoiceSnapshot = Object.freeze({
      ...invoice,
      status: 'POSTED',
      journalEntryId: input.voucherId,
    })
    this.#vendorInvoices.set(invoice.id, postedInvoice)

    const voucherSnapshot: AccountsPayableVoucherSnapshot = Object.freeze({
      invoiceId: invoice.id,
      journalEntryId: input.voucherId,
      journalEntryNumber: input.voucherNumber,
      companyId: invoice.companyId,
      totalAmountMinorUnits: invoice.totalAmountMinorUnits,
      currency: invoice.currency,
      postedAt: new Date(),
    })

    this.eventEmitter?.emit(
      AccountsPayableVoucherCreatedEvent.EVENT_NAME,
      new AccountsPayableVoucherCreatedEvent(
        invoice.id,
        input.voucherId,
        invoice.companyId,
        invoice.totalAmountMinorUnits,
        voucherSnapshot.postedAt
      )
    )

    return ok(voucherSnapshot)
  }
}
