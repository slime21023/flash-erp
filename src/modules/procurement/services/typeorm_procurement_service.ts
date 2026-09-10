import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import {
  OutboxService,
  type TransactionOptions,
  runInTransaction,
} from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import {
  ApprovalPipeline,
  ApprovalPublicationError,
  type ApprovalStep,
  type ApprovalError,
} from '@platform/workflow/index.js'
import { InventoryContract } from '@modules/inventory/contracts/index.js'
import { FinanceContract, type JournalLine } from '@modules/finance/contracts/index.js'
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
  type PurchaseOrderLineInput,
  type PurchaseOrderSnapshot,
  type PurchaseRequisitionSnapshot,
  type ReceiveGoodsInput,
  type RegisterSupplierInput,
  type RegisterVendorInvoiceInput,
  type SupplierSnapshot,
  type ThreeWayMatchToleranceOptions,
  type VendorInvoiceSnapshot,
} from '../contracts/index.js'
import { SupplierEntity } from '../entities/supplier.entity.js'
import { PurchaseOrderEntity } from '../entities/purchase_order.entity.js'
import { PurchaseOrderLineEntity } from '../entities/purchase_order_line.entity.js'
import { GoodsReceiptEntity } from '../entities/goods_receipt.entity.js'
import { GoodsReceiptLineEntity } from '../entities/goods_receipt_line.entity.js'
import { PurchaseRequisitionEntity } from '../entities/purchase_requisition.entity.js'
import { PurchaseRequisitionLineEntity } from '../entities/purchase_requisition_line.entity.js'
import { VendorInvoiceEntity } from '../entities/vendor_invoice.entity.js'
import { VendorInvoiceLineEntity } from '../entities/vendor_invoice_line.entity.js'
import { ThreeWayMatcher, calculateTaxAndTotal } from './three_way_matcher.js'

@Injectable()
export class TypeOrmProcurementService extends ProcurementContract {
  constructor(
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(PurchaseOrderEntity)
    private readonly poRepo: Repository<PurchaseOrderEntity>,
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
    @InjectRepository(PurchaseRequisitionEntity)
    private readonly requisitionRepo: Repository<PurchaseRequisitionEntity>,
    @InjectRepository(VendorInvoiceEntity)
    private readonly invoiceRepo: Repository<VendorInvoiceEntity>,
    private readonly inventory: InventoryContract,
    private readonly outbox: OutboxService,
    private readonly finance: FinanceContract
  ) {
    super()
  }

  async registerSupplier(
    input: RegisterSupplierInput,
    options?: TransactionOptions
  ): Promise<Result<SupplierSnapshot, ProcurementError | SupplierAlreadyExistsError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !companyId || !code || !name) {
      return err(new ProcurementError('Supplier fields are required'))
    }

    const manager = options?.client ?? this.supplierRepo.manager
    const duplicate = await manager
      .createQueryBuilder(SupplierEntity, 's')
      .where('s.id = :id OR (s.company_id = :companyId AND s.code = :code)', {
        id,
        companyId,
        code,
      })
      .getOne()

    if (duplicate) {
      return err(new SupplierAlreadyExistsError(duplicate.id === id ? id : code))
    }

    try {
      const entity = manager.create(SupplierEntity, {
        id,
        companyId,
        code,
        name,
        isActive: true,
      })
      await manager.save(entity)
      return ok({
        id: entity.id,
        companyId: entity.companyId,
        code: entity.code,
        name: entity.name,
        isActive: entity.isActive,
      })
    } catch {
      return err(new SupplierAlreadyExistsError(code))
    }
  }

  async createPurchaseOrder(
    input: CreatePurchaseOrderInput,
    options?: TransactionOptions
  ): Promise<Result<PurchaseOrderSnapshot, ProcurementError | SupplierNotFoundError>> {
    return runInTransaction<PurchaseOrderSnapshot, ProcurementError | SupplierNotFoundError>(
      this.poRepo.manager,
      options,
      async (client) => {
        const id = input.id.trim()
        const companyId = input.companyId.trim()
        const supplierId = input.supplierId.trim()
        const number = input.number.trim()

        if (!id || !companyId || !supplierId || !number || input.lines.length === 0) {
          return err(
            new ProcurementError('Purchase order fields and at least one line are required')
          )
        }

        for (const line of input.lines) {
          if (line.orderedQuantity <= 0n || line.unitCostMinorUnits < 0n) {
            return err(new ProcurementError('Invalid line quantity or unit cost'))
          }
        }

        const supplier = await client.findOne(SupplierEntity, {
          where: { id: supplierId, companyId, isActive: true },
        })
        if (!supplier) {
          return err(new SupplierNotFoundError(supplierId))
        }

        try {
          const po = client.create(PurchaseOrderEntity, {
            id,
            companyId,
            supplierId,
            number,
            status: 'DRAFT',
          })
          await client.save(po)

          const lines = input.lines.map((line) =>
            client.create(PurchaseOrderLineEntity, {
              purchaseOrderId: id,
              itemId: line.itemId,
              orderedQuantity: line.orderedQuantity.toString(),
              unitCostMinorUnits: line.unitCostMinorUnits.toString(),
              currency: line.currency,
            })
          )
          await client.save(lines)

          return ok({
            id,
            companyId,
            supplierId,
            number,
            status: 'DRAFT',
            lines: input.lines,
          })
        } catch {
          return err(new ProcurementError(`Unable to create purchase order: ${id}`))
        }
      }
    )
  }

  async approvePurchaseOrder(
    id: string,
    approver?: ApproverContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseOrderSnapshot,
      PurchaseOrderNotFoundError | InvalidPurchaseOrderStateError | ApprovalError
    >
  > {
    return runInTransaction<
      PurchaseOrderSnapshot,
      PurchaseOrderNotFoundError | InvalidPurchaseOrderStateError | ApprovalError
    >(this.poRepo.manager, options, async (manager) => {
      const po = await manager.findOne(PurchaseOrderEntity, {
        where: { id },
        relations: ['lines'],
      })

      if (!po) {
        return err(new PurchaseOrderNotFoundError(id))
      }

      if (po.status !== 'DRAFT') {
        return err(new InvalidPurchaseOrderStateError(po.status, 'approve'))
      }

      if (approver) {
        const totalAmount = (po.lines ?? []).reduce(
          (sum, line) => sum + BigInt(line.orderedQuantity) * BigInt(line.unitCostMinorUnits),
          0n
        )
        const steps: ApprovalStep<{ totalAmount: bigint }>[] = [
          { id: 'mgr-review', name: 'Manager Review', requiredRole: 'MANAGER' },
          {
            id: 'director-review',
            name: 'Director Review',
            requiredRole: 'DIRECTOR',
            condition: (ctx) => ctx.totalAmount >= 100_000n,
          },
        ]
        const pipeline = ApprovalPipeline.create(id, { totalAmount }, steps)
        const approveRes = pipeline.approve(
          pipeline.currentStepId!,
          approver.actorId,
          approver.roles,
          approver.comment
        )
        if (approveRes.isErr) {
          return err(approveRes.error)
        }
        if (approveRes.value.status !== 'APPROVED') {
          return ok({
            id: po.id,
            companyId: po.companyId,
            supplierId: po.supplierId,
            number: po.number,
            status: po.status,
            lines: (po.lines ?? []).map((l) => ({
              itemId: l.itemId,
              orderedQuantity: BigInt(l.orderedQuantity),
              unitCostMinorUnits: BigInt(l.unitCostMinorUnits),
              currency: l.currency,
            })),
          })
        }
      }

      po.status = 'APPROVED'
      await manager.save(po)

      const eventResult = await this.outbox.enqueue(
        PurchaseOrderApprovedEvent.EVENT_NAME,
        new PurchaseOrderApprovedEvent(po.id, po.companyId, po.supplierId, new Date()),
        { client: manager }
      )
      if (eventResult.isErr) return err(new ApprovalPublicationError(eventResult.error.message))

      return ok({
        id: po.id,
        companyId: po.companyId,
        supplierId: po.supplierId,
        number: po.number,
        status: po.status,
        lines: (po.lines ?? []).map((l) => ({
          itemId: l.itemId,
          orderedQuantity: BigInt(l.orderedQuantity),
          unitCostMinorUnits: BigInt(l.unitCostMinorUnits),
          currency: l.currency,
        })),
      })
    })
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
    return runInTransaction<
      GoodsReceiptSnapshot,
      PurchaseOrderNotFoundError | InvalidPurchaseOrderStateError | ProcurementError
    >(this.receiptRepo.manager, options, async (client) => {
      const id = input.id.trim()
      const purchaseOrderId = input.purchaseOrderId.trim()
      const warehouseId = input.warehouseId.trim()

      if (!id || !purchaseOrderId || !warehouseId) {
        return err(new ProcurementError('id, purchaseOrderId, and warehouseId are required'))
      }

      const po = await client.findOne(PurchaseOrderEntity, {
        where: { id: purchaseOrderId },
        relations: ['lines'],
      })

      if (!po) {
        return err(new PurchaseOrderNotFoundError(purchaseOrderId))
      }

      if (po.status !== 'APPROVED') {
        return err(new InvalidPurchaseOrderStateError(po.status, 'receive'))
      }

      const receiptLines: readonly GoodsReceiptLineInput[] =
        input.lines && input.lines.length > 0
          ? Object.freeze([...input.lines])
          : Object.freeze(
              (po.lines ?? []).map((l) => ({
                itemId: l.itemId,
                receivedQuantity: BigInt(l.orderedQuantity),
              }))
            )

      try {
        const receipt = client.create(GoodsReceiptEntity, {
          id,
          purchaseOrderId,
          warehouseId,
          receivedAt: input.receivedAt,
        })
        await client.save(receipt)

        const lineEntities = receiptLines.map((l) =>
          client.create(GoodsReceiptLineEntity, {
            receiptId: id,
            itemId: l.itemId,
            receivedQuantity: l.receivedQuantity.toString(),
          })
        )
        await client.save(lineEntities)

        // Automatically post stock movement if inventory contract is injected
        if (po.lines) {
          const poLinesByItem = new Map(po.lines.map((l) => [l.itemId, l]))
          for (const line of receiptLines) {
            const poLine = poLinesByItem.get(line.itemId)
            const unitCost = poLine ? BigInt(poLine.unitCostMinorUnits) : 0n
            const currency = poLine?.currency ?? 'TWD'

            const moveRes = await this.inventory.recordMovement(
              {
                id: `mov-${id}-${line.itemId}`,
                companyId: po.companyId,
                itemId: line.itemId,
                warehouseId,
                sourceType: 'GOODS_RECEIPT',
                sourceId: id,
                quantityDelta: line.receivedQuantity,
                unitCostMinorUnits: unitCost,
                currency,
                occurredAt: input.receivedAt,
              },
              { client }
            )
            if (moveRes.isErr) {
              return err(
                new ProcurementError(`Inventory movement failed: ${moveRes.error.message}`)
              )
            }
          }
        }

        const eventResult = await this.outbox.enqueue(
          GoodsReceivedEvent.EVENT_NAME,
          new GoodsReceivedEvent(
            receipt.id,
            po.id,
            po.companyId,
            receipt.warehouseId,
            receipt.receivedAt
          ),
          { client }
        )
        if (eventResult.isErr) return err(new ProcurementError(eventResult.error.message))

        return ok({
          id,
          purchaseOrderId,
          warehouseId,
          receivedAt: input.receivedAt,
          lines: receiptLines,
        })
      } catch {
        return err(new ProcurementError(`Unable to process goods receipt: ${id}`))
      }
    })
  }

  async createRequisition(
    input: CreatePurchaseRequisitionInput,
    options?: TransactionOptions
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

    const manager = options?.client ?? this.requisitionRepo.manager
    try {
      const pr = manager.create(PurchaseRequisitionEntity, {
        id,
        companyId,
        requesterId,
        number,
        status: 'DRAFT',
        memo: input.memo,
      })
      await manager.save(pr)

      const lineEntities = input.lines.map((l) =>
        manager.create(PurchaseRequisitionLineEntity, {
          requisitionId: id,
          itemId: l.itemId,
          requestedQuantity: l.requestedQuantity.toString(),
          estimatedCostMinorUnits: l.estimatedCostMinorUnits.toString(),
          currency: l.currency,
        })
      )
      await manager.save(lineEntities)

      return ok({
        id,
        companyId,
        requesterId,
        number,
        status: 'DRAFT',
        memo: input.memo,
        lines: input.lines,
      })
    } catch {
      return err(new ProcurementError(`Unable to create purchase requisition: ${id}`))
    }
  }

  async submitRequisition(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseRequisitionSnapshot,
      PurchaseRequisitionNotFoundError | InvalidPurchaseRequisitionStateError
    >
  > {
    const manager = options?.client ?? this.requisitionRepo.manager
    const pr = await manager.findOne(PurchaseRequisitionEntity, {
      where: { id },
      relations: ['lines'],
    })

    if (!pr) {
      return err(new PurchaseRequisitionNotFoundError(id))
    }

    if (pr.status !== 'DRAFT') {
      return err(new InvalidPurchaseRequisitionStateError(pr.status, 'submit'))
    }

    pr.status = 'SUBMITTED'
    await manager.save(pr)

    return ok({
      id: pr.id,
      companyId: pr.companyId,
      requesterId: pr.requesterId,
      number: pr.number,
      status: pr.status,
      memo: pr.memo,
      lines: (pr.lines ?? []).map((l) => ({
        itemId: l.itemId,
        requestedQuantity: BigInt(l.requestedQuantity),
        estimatedCostMinorUnits: BigInt(l.estimatedCostMinorUnits),
        currency: l.currency,
      })),
    })
  }

  async approveRequisition(
    id: string,
    approver?: ApproverContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseRequisitionSnapshot,
      PurchaseRequisitionNotFoundError | InvalidPurchaseRequisitionStateError | ApprovalError
    >
  > {
    return runInTransaction<
      PurchaseRequisitionSnapshot,
      PurchaseRequisitionNotFoundError | InvalidPurchaseRequisitionStateError | ApprovalError
    >(this.requisitionRepo.manager, options, async (manager) => {
      const pr = await manager.findOne(PurchaseRequisitionEntity, {
        where: { id },
        relations: ['lines'],
      })

      if (!pr) {
        return err(new PurchaseRequisitionNotFoundError(id))
      }

      if (pr.status !== 'SUBMITTED' && pr.status !== 'DRAFT') {
        return err(new InvalidPurchaseRequisitionStateError(pr.status, 'approve'))
      }

      if (approver && !approver.roles.some((r) => ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(r))) {
        return err(new ProcurementError('Only managers or directors can approve requisitions'))
      }

      pr.status = 'APPROVED'
      await manager.save(pr)

      const eventResult = await this.outbox.enqueue(
        PurchaseRequisitionApprovedEvent.EVENT_NAME,
        new PurchaseRequisitionApprovedEvent(pr.id, pr.companyId, pr.requesterId, new Date()),
        { client: manager }
      )
      if (eventResult.isErr) return err(new ApprovalPublicationError(eventResult.error.message))

      return ok({
        id: pr.id,
        companyId: pr.companyId,
        requesterId: pr.requesterId,
        number: pr.number,
        status: pr.status,
        memo: pr.memo,
        lines: (pr.lines ?? []).map((l) => ({
          itemId: l.itemId,
          requestedQuantity: BigInt(l.requestedQuantity),
          estimatedCostMinorUnits: BigInt(l.estimatedCostMinorUnits),
          currency: l.currency,
        })),
      })
    })
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
    const manager = options?.client ?? this.requisitionRepo.manager
    const pr = await manager.findOne(PurchaseRequisitionEntity, {
      where: { id: requisitionId },
      relations: ['lines'],
    })

    if (!pr) {
      return err(new PurchaseRequisitionNotFoundError(requisitionId))
    }

    if (pr.status !== 'APPROVED') {
      return err(new InvalidPurchaseRequisitionStateError(pr.status, 'convert'))
    }

    const poLines = (pr.lines ?? []).map((l) => ({
      itemId: l.itemId,
      orderedQuantity: BigInt(l.requestedQuantity),
      unitCostMinorUnits: BigInt(l.estimatedCostMinorUnits),
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

    pr.status = 'CONVERTED'
    pr.convertedPurchaseOrderId = poRes.value.id
    await manager.save(pr)

    return ok(poRes.value)
  }

  async registerVendorInvoice(
    input: RegisterVendorInvoiceInput,
    options?: TransactionOptions
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

    return runInTransaction<
      VendorInvoiceSnapshot,
      | PurchaseOrderNotFoundError
      | SupplierNotFoundError
      | VendorInvoiceAlreadyExistsError
      | ProcurementError
    >(this.invoiceRepo.manager, options, async (manager) => {
      const supplier = await manager.findOne(SupplierEntity, {
        where: { id: supplierId, companyId, isActive: true },
      })
      if (!supplier) {
        return err(new SupplierNotFoundError(supplierId))
      }

      const po = await manager.findOne(PurchaseOrderEntity, {
        where: { id: purchaseOrderId, companyId },
      })
      if (!po) {
        return err(new PurchaseOrderNotFoundError(purchaseOrderId))
      }

      const existingInvoice = await manager.findOne(VendorInvoiceEntity, {
        where: { companyId, invoiceNumber },
      })
      if (existingInvoice) {
        return err(new VendorInvoiceAlreadyExistsError(invoiceNumber))
      }

      // Compute line totals and net amount
      const processedLines = input.lines.map((l) => ({
        itemId: l.itemId,
        invoicedQuantity: l.invoicedQuantity,
        unitPriceMinorUnits: l.unitPriceMinorUnits,
        lineTotalMinorUnits: l.lineTotalMinorUnits ?? l.invoicedQuantity * l.unitPriceMinorUnits,
      }))

      const netAmountMinorUnits = processedLines.reduce((sum, l) => sum + l.lineTotalMinorUnits, 0n)
      const taxRateBps = input.taxRateBasisPoints ?? 500
      const { taxAmountMinorUnits, totalAmountMinorUnits } = calculateTaxAndTotal(
        netAmountMinorUnits,
        taxRateBps
      )

      try {
        const invoice = manager.create(VendorInvoiceEntity, {
          id,
          companyId,
          supplierId,
          purchaseOrderId,
          invoiceNumber,
          invoiceDate,
          currency: input.currency,
          taxRateBasisPoints: taxRateBps,
          netAmountMinorUnits: netAmountMinorUnits.toString(),
          taxAmountMinorUnits: taxAmountMinorUnits.toString(),
          totalAmountMinorUnits: totalAmountMinorUnits.toString(),
          status: 'RECEIVED',
        })
        await manager.save(invoice)

        const lineEntities = processedLines.map((l) =>
          manager.create(VendorInvoiceLineEntity, {
            invoiceId: id,
            itemId: l.itemId,
            invoicedQuantity: l.invoicedQuantity.toString(),
            unitPriceMinorUnits: l.unitPriceMinorUnits.toString(),
            lineTotalMinorUnits: l.lineTotalMinorUnits.toString(),
          })
        )
        await manager.save(lineEntities)

        return ok({
          id,
          companyId,
          supplierId,
          purchaseOrderId,
          invoiceNumber,
          invoiceDate,
          currency: input.currency,
          taxRateBasisPoints: taxRateBps,
          netAmountMinorUnits,
          taxAmountMinorUnits,
          totalAmountMinorUnits,
          status: 'RECEIVED',
          lines: processedLines,
        })
      } catch {
        return err(new ProcurementError(`Unable to register vendor invoice: ${id}`))
      }
    })
  }

  async matchVendorInvoice(
    invoiceId: string,
    tolerance?: ThreeWayMatchToleranceOptions,
    options?: TransactionOptions
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
    return runInTransaction<
      MatchResultSnapshot,
      | VendorInvoiceNotFoundError
      | PurchaseOrderNotFoundError
      | InvalidVendorInvoiceStateError
      | MatchingToleranceExceededError
      | ProcurementError
    >(this.invoiceRepo.manager, options, async (manager) => {
      const invoice = await manager.findOne(VendorInvoiceEntity, {
        where: { id: invoiceId },
        relations: ['lines'],
      })

      if (!invoice) {
        return err(new VendorInvoiceNotFoundError(invoiceId))
      }

      if (invoice.status !== 'RECEIVED' && invoice.status !== 'DISPUTED') {
        return err(new InvalidVendorInvoiceStateError(invoice.status, 'match'))
      }

      const po = await manager.findOne(PurchaseOrderEntity, {
        where: { id: invoice.purchaseOrderId },
        relations: ['lines'],
      })
      if (!po) {
        return err(new PurchaseOrderNotFoundError(invoice.purchaseOrderId))
      }

      const receipts = await manager.find(GoodsReceiptEntity, {
        where: { purchaseOrderId: po.id },
        relations: ['lines'],
      })

      const receiptLines: { itemId: string; receivedQuantity: bigint }[] = []
      for (const r of receipts) {
        for (const line of r.lines ?? []) {
          receiptLines.push({
            itemId: line.itemId,
            receivedQuantity: BigInt(line.receivedQuantity),
          })
        }
      }

      const poLines: PurchaseOrderLineInput[] = (po.lines ?? []).map((l) => ({
        itemId: l.itemId,
        orderedQuantity: BigInt(l.orderedQuantity),
        unitCostMinorUnits: BigInt(l.unitCostMinorUnits),
        currency: l.currency,
      }))

      const invoiceSnapshot: VendorInvoiceSnapshot = {
        id: invoice.id,
        companyId: invoice.companyId,
        supplierId: invoice.supplierId,
        purchaseOrderId: invoice.purchaseOrderId,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        currency: invoice.currency,
        taxRateBasisPoints: invoice.taxRateBasisPoints,
        netAmountMinorUnits: BigInt(invoice.netAmountMinorUnits),
        taxAmountMinorUnits: BigInt(invoice.taxAmountMinorUnits),
        totalAmountMinorUnits: BigInt(invoice.totalAmountMinorUnits),
        status: invoice.status,
        lines: (invoice.lines ?? []).map((l) => ({
          itemId: l.itemId,
          invoicedQuantity: BigInt(l.invoicedQuantity),
          unitPriceMinorUnits: BigInt(l.unitPriceMinorUnits),
          lineTotalMinorUnits: BigInt(l.lineTotalMinorUnits),
        })),
      }

      const matchRes = ThreeWayMatcher.match(poLines, receiptLines, invoiceSnapshot, tolerance)
      if (matchRes.isErr) {
        invoice.status = 'DISPUTED'
        await manager.save(invoice)
        return err(matchRes.error)
      }

      invoice.status = 'MATCHED'
      invoice.matchedAt = matchRes.value.matchedAt
      await manager.save(invoice)

      const eventResult = await this.outbox.enqueue(
        VendorInvoiceMatchedEvent.EVENT_NAME,
        new VendorInvoiceMatchedEvent(
          invoice.id,
          invoice.companyId,
          invoice.purchaseOrderId,
          matchRes.value.matchedAt
        ),
        { client: manager }
      )
      if (eventResult.isErr) return err(new ProcurementError(eventResult.error.message))

      return ok(matchRes.value)
    })
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
    return runInTransaction<
      AccountsPayableVoucherSnapshot,
      VendorInvoiceNotFoundError | InvalidVendorInvoiceStateError | AccountsPayablePostingError
    >(this.invoiceRepo.manager, options, async (client) => {
      const invoice = await client.findOne(VendorInvoiceEntity, {
        where: { id: input.invoiceId },
      })

      if (!invoice) {
        return err(new VendorInvoiceNotFoundError(input.invoiceId))
      }

      if (invoice.status !== 'MATCHED') {
        return err(new InvalidVendorInvoiceStateError(invoice.status, 'create AP voucher'))
      }

      const netMinor = BigInt(invoice.netAmountMinorUnits)
      const taxMinor = BigInt(invoice.taxAmountMinorUnits)
      const totalMinor = BigInt(invoice.totalAmountMinorUnits)

      const lines: JournalLine[] = []
      const invDebit = Money.fromMinorUnits(netMinor, invoice.currency)
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
      if (taxMinor > 0n) {
        const taxDebit = Money.fromMinorUnits(taxMinor, invoice.currency)
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
      const apCredit = Money.fromMinorUnits(totalMinor, invoice.currency)
      if (apCredit.isErr) {
        return err(new AccountsPayablePostingError('Failed to create AP credit amount'))
      }
      lines.push({
        accountId: input.payableAccountId ?? 'account-ap',
        debit: zeroMoney,
        credit: apCredit.value,
        memo: `AP Vendor Payable for invoice ${invoice.invoiceNumber}`,
      })

      {
        const draftRes = await this.finance.createDraft(
          {
            id: input.voucherId,
            companyId: invoice.companyId,
            number: input.voucherNumber,
            accountingDate: input.accountingDate,
            memo: input.memo ?? `AP Voucher for invoice ${invoice.invoiceNumber}`,
            lines,
          },
          { client }
        )

        if (draftRes.isErr) {
          return err(
            new AccountsPayablePostingError(`Finance createDraft failed: ${draftRes.error.message}`)
          )
        }
      }

      invoice.status = 'POSTED'
      invoice.journalEntryId = input.voucherId
      await client.save(invoice)

      const postedAt = new Date()
      const eventResult = await this.outbox.enqueue(
        AccountsPayableVoucherCreatedEvent.EVENT_NAME,
        new AccountsPayableVoucherCreatedEvent(
          invoice.id,
          input.voucherId,
          invoice.companyId,
          totalMinor,
          postedAt
        ),
        { client }
      )
      if (eventResult.isErr) {
        return err(new AccountsPayablePostingError(eventResult.error.message))
      }

      return ok({
        invoiceId: invoice.id,
        journalEntryId: input.voucherId,
        journalEntryNumber: input.voucherNumber,
        companyId: invoice.companyId,
        totalAmountMinorUnits: totalMinor,
        currency: invoice.currency,
        postedAt,
      })
    })
  }
}
