import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { type Result, err, ok } from '@platform/fp/index.js'
import {
  OutboxService,
  type TransactionOptions,
  runInTransaction,
} from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import { InventoryContract, InsufficientStockError } from '@modules/inventory/contracts/index.js'
import { FinanceContract, type JournalLine } from '@modules/finance/contracts/index.js'
import {
  AccountsReceivablePostingError,
  CreditLimitExceededError,
  CustomerAlreadyExistsError,
  CustomerNotFoundError,
  InvalidSalesOrderStateError,
  SalesContract,
  SalesError,
  SalesOrderConfirmedEvent,
  SalesOrderNotFoundError,
  SalesOrderShippedEvent,
  ShipmentError,
  type CreateSalesOrderInput,
  type CreateShipmentInput,
  type CustomerCreditCheckResult,
  type CustomerSnapshot,
  type RegisterCustomerInput,
  type SalesOrderLineSnapshot,
  type SalesOrderSnapshot,
  type ShipmentLineSnapshot,
  type ShipmentSnapshot,
} from '../contracts/index.js'
import { CustomerEntity } from '../entities/customer.entity.js'
import { SalesOrderEntity } from '../entities/sales_order.entity.js'
import { SalesOrderLineEntity } from '../entities/sales_order_line.entity.js'
import { ShipmentEntity } from '../entities/shipment.entity.js'
import { ShipmentLineEntity } from '../entities/shipment_line.entity.js'

@Injectable()
export class TypeOrmSalesService extends SalesContract {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly soRepo: Repository<SalesOrderEntity>,
    @InjectRepository(SalesOrderLineEntity)
    private readonly soLineRepo: Repository<SalesOrderLineEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipmentRepo: Repository<ShipmentEntity>,
    @InjectRepository(ShipmentLineEntity)
    private readonly shipmentLineRepo: Repository<ShipmentLineEntity>,
    private readonly inventory: InventoryContract,
    private readonly outbox: OutboxService,
    private readonly finance: FinanceContract
  ) {
    super()
  }

  async registerCustomer(
    input: RegisterCustomerInput,
    options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, SalesError | CustomerAlreadyExistsError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !companyId || !code || !name) {
      return err(new SalesError('Customer id, companyId, code, and name are required'))
    }

    const manager = options?.client ?? this.customerRepo.manager
    const existing = await manager.findOne(CustomerEntity, { where: { companyId, code } })
    if (existing) {
      return err(new CustomerAlreadyExistsError(code))
    }

    try {
      const entity = manager.create(CustomerEntity, {
        id,
        companyId,
        code,
        name,
        paymentTerms: input.paymentTerms || 'NET30',
        currency: input.currency || 'TWD',
        creditLimitMinorUnits: input.creditLimitMinorUnits.toString(),
        currentOutstandingMinorUnits: '0',
        isActive: true,
      })
      await manager.save(entity)

      return ok({
        id: entity.id,
        companyId: entity.companyId,
        code: entity.code,
        name: entity.name,
        paymentTerms: entity.paymentTerms,
        currency: entity.currency,
        creditLimitMinorUnits: BigInt(entity.creditLimitMinorUnits),
        currentOutstandingMinorUnits: 0n,
        isActive: entity.isActive,
      })
    } catch {
      return err(new SalesError(`Unable to register customer: ${id}`))
    }
  }

  async getCustomer(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, CustomerNotFoundError>> {
    const manager = options?.client ?? this.customerRepo.manager
    const entity = await manager.findOne(CustomerEntity, { where: { id } })
    if (!entity) {
      return err(new CustomerNotFoundError(id))
    }
    return ok({
      id: entity.id,
      companyId: entity.companyId,
      code: entity.code,
      name: entity.name,
      paymentTerms: entity.paymentTerms,
      currency: entity.currency,
      creditLimitMinorUnits: BigInt(entity.creditLimitMinorUnits),
      currentOutstandingMinorUnits: BigInt(entity.currentOutstandingMinorUnits),
      isActive: entity.isActive,
    })
  }

  async checkCustomerCredit(
    customerId: string,
    additionalOrderAmountMinorUnits = 0n,
    options?: TransactionOptions
  ): Promise<Result<CustomerCreditCheckResult, CustomerNotFoundError>> {
    const manager = options?.client ?? this.customerRepo.manager
    const customer = await manager.findOne(CustomerEntity, { where: { id: customerId } })
    if (!customer) {
      return err(new CustomerNotFoundError(customerId))
    }

    const pendingOrders = await manager.find(SalesOrderEntity, {
      where: { customerId, status: 'CONFIRMED' },
    })

    const pendingOrdersMinorUnits = pendingOrders.reduce(
      (sum, so) => sum + BigInt(so.totalAmountMinorUnits),
      0n
    )

    const creditLimit = BigInt(customer.creditLimitMinorUnits)
    const currentOutstanding = BigInt(customer.currentOutstandingMinorUnits)
    const totalExposure =
      currentOutstanding + pendingOrdersMinorUnits + additionalOrderAmountMinorUnits

    const isApproved = totalExposure <= creditLimit
    const excessMinorUnits = isApproved ? 0n : totalExposure - creditLimit

    return ok({
      customerId,
      creditLimitMinorUnits: creditLimit,
      currentOutstandingMinorUnits: currentOutstanding,
      pendingOrdersMinorUnits,
      totalExposureMinorUnits: totalExposure,
      isApproved,
      excessMinorUnits,
    })
  }

  async createSalesOrder(
    input: CreateSalesOrderInput,
    options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesError | CustomerNotFoundError>> {
    return runInTransaction<SalesOrderSnapshot, SalesError | CustomerNotFoundError>(
      this.soRepo.manager,
      options,
      async (client) => {
        const id = input.id.trim()
        const companyId = input.companyId.trim()
        const customerId = input.customerId.trim()
        const number = input.number.trim()

        if (!id || !companyId || !customerId || !number || input.lines.length === 0) {
          return err(new SalesError('Sales order fields and at least one line are required'))
        }

        const customer = await client.findOne(CustomerEntity, {
          where: { id: customerId, companyId, isActive: true },
        })
        if (!customer) {
          return err(new CustomerNotFoundError(customerId))
        }

        for (const line of input.lines) {
          if (line.orderedQuantity <= 0n || line.unitPriceMinorUnits < 0n) {
            return err(new SalesError('Line ordered quantity and unit price must be valid'))
          }
        }

        const processedLines: SalesOrderLineSnapshot[] = input.lines.map((l) => ({
          itemId: l.itemId,
          warehouseId: l.warehouseId,
          orderedQuantity: l.orderedQuantity,
          shippedQuantity: 0n,
          unitPriceMinorUnits: l.unitPriceMinorUnits,
          lineTotalMinorUnits: l.orderedQuantity * l.unitPriceMinorUnits,
          currency: l.currency,
        }))

        const netAmountMinorUnits = processedLines.reduce(
          (sum, l) => sum + l.lineTotalMinorUnits,
          0n
        )
        const taxRateBps = input.taxRateBasisPoints ?? 500
        const taxAmountMinorUnits = (netAmountMinorUnits * BigInt(taxRateBps) + 5000n) / 10000n
        const totalAmountMinorUnits = netAmountMinorUnits + taxAmountMinorUnits

        try {
          const so = client.create(SalesOrderEntity, {
            id,
            companyId,
            customerId,
            number,
            status: 'DRAFT',
            taxRateBasisPoints: taxRateBps,
            netAmountMinorUnits: netAmountMinorUnits.toString(),
            taxAmountMinorUnits: taxAmountMinorUnits.toString(),
            totalAmountMinorUnits: totalAmountMinorUnits.toString(),
            memo: input.memo,
            reservationIds: [],
          })
          await client.save(so)

          const lineEntities = processedLines.map((l) =>
            client.create(SalesOrderLineEntity, {
              salesOrderId: id,
              itemId: l.itemId,
              warehouseId: l.warehouseId,
              orderedQuantity: l.orderedQuantity.toString(),
              shippedQuantity: '0',
              unitPriceMinorUnits: l.unitPriceMinorUnits.toString(),
              lineTotalMinorUnits: l.lineTotalMinorUnits.toString(),
              currency: l.currency,
            })
          )
          await client.save(lineEntities)

          return ok({
            id,
            companyId,
            customerId,
            number,
            status: 'DRAFT',
            taxRateBasisPoints: taxRateBps,
            netAmountMinorUnits,
            taxAmountMinorUnits,
            totalAmountMinorUnits,
            reservationIds: [],
            lines: processedLines,
            memo: input.memo,
          })
        } catch {
          return err(new SalesError(`Unable to create sales order: ${id}`))
        }
      }
    )
  }

  async getSalesOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesOrderNotFoundError>> {
    const manager = options?.client ?? this.soRepo.manager
    const so = await manager.findOne(SalesOrderEntity, {
      where: { id },
      relations: ['lines'],
    })
    if (!so) {
      return err(new SalesOrderNotFoundError(id))
    }
    return ok({
      id: so.id,
      companyId: so.companyId,
      customerId: so.customerId,
      number: so.number,
      status: so.status as any,
      taxRateBasisPoints: so.taxRateBasisPoints,
      netAmountMinorUnits: BigInt(so.netAmountMinorUnits),
      taxAmountMinorUnits: BigInt(so.taxAmountMinorUnits),
      totalAmountMinorUnits: BigInt(so.totalAmountMinorUnits),
      reservationIds: so.reservationIds ?? [],
      lines: so.lines.map((l) => ({
        itemId: l.itemId,
        warehouseId: l.warehouseId,
        orderedQuantity: BigInt(l.orderedQuantity),
        shippedQuantity: BigInt(l.shippedQuantity),
        unitPriceMinorUnits: BigInt(l.unitPriceMinorUnits),
        lineTotalMinorUnits: BigInt(l.lineTotalMinorUnits),
        currency: l.currency,
      })),
      memo: so.memo,
    })
  }

  async confirmSalesOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      SalesOrderSnapshot,
      | SalesOrderNotFoundError
      | InvalidSalesOrderStateError
      | CustomerNotFoundError
      | CreditLimitExceededError
      | InsufficientStockError
      | SalesError
    >
  > {
    return runInTransaction<
      SalesOrderSnapshot,
      | SalesOrderNotFoundError
      | InvalidSalesOrderStateError
      | CustomerNotFoundError
      | CreditLimitExceededError
      | InsufficientStockError
      | SalesError
    >(this.soRepo.manager, options, async (client) => {
      const so = await client.findOne(SalesOrderEntity, {
        where: { id },
        relations: ['lines'],
      })

      if (!so) {
        return err(new SalesOrderNotFoundError(id))
      }

      if (so.status !== 'DRAFT') {
        return err(new InvalidSalesOrderStateError(so.status, 'confirm'))
      }

      const orderAmount = BigInt(so.totalAmountMinorUnits)
      const creditCheck = await this.checkCustomerCredit(so.customerId, orderAmount, { client })
      if (creditCheck.isErr) return err(creditCheck.error)

      if (!creditCheck.value.isApproved) {
        return err(
          new CreditLimitExceededError({
            customerId: so.customerId,
            creditLimitMinorUnits: creditCheck.value.creditLimitMinorUnits,
            currentOutstandingMinorUnits: creditCheck.value.currentOutstandingMinorUnits,
            pendingOrdersMinorUnits: creditCheck.value.pendingOrdersMinorUnits,
            requestedOrderAmountMinorUnits: orderAmount,
            excessMinorUnits: creditCheck.value.excessMinorUnits,
          })
        )
      }

      const reservationIds: string[] = []
      {
        for (const line of so.lines ?? []) {
          const resId = `res-${so.id}-${line.itemId}`
          const reserveRes = await this.inventory.reserve(
            {
              id: resId,
              companyId: so.companyId,
              itemId: line.itemId,
              warehouseId: line.warehouseId,
              quantity: BigInt(line.orderedQuantity),
              referenceType: 'SALES_ORDER',
              referenceId: so.id,
            },
            { client }
          )

          if (reserveRes.isErr) {
            for (const madeId of reservationIds) {
              await this.inventory.releaseReservation(madeId, { client })
            }
            if (reserveRes.error instanceof InsufficientStockError) {
              return err(reserveRes.error)
            }
            return err(new SalesError(reserveRes.error.message))
          }
          reservationIds.push(resId)
        }
      }

      so.status = 'CONFIRMED'
      so.reservationIds = reservationIds
      await client.save(so)

      const eventResult = await this.outbox.enqueue(
        SalesOrderConfirmedEvent.EVENT_NAME,
        new SalesOrderConfirmedEvent(so.id, so.companyId, so.customerId, orderAmount, new Date()),
        { client }
      )
      if (eventResult.isErr) return err(new SalesError(eventResult.error.message))

      return ok({
        id: so.id,
        companyId: so.companyId,
        customerId: so.customerId,
        number: so.number,
        status: 'CONFIRMED',
        taxRateBasisPoints: so.taxRateBasisPoints,
        netAmountMinorUnits: BigInt(so.netAmountMinorUnits),
        taxAmountMinorUnits: BigInt(so.taxAmountMinorUnits),
        totalAmountMinorUnits: orderAmount,
        reservationIds,
        lines: (so.lines ?? []).map((l) => ({
          itemId: l.itemId,
          warehouseId: l.warehouseId,
          orderedQuantity: BigInt(l.orderedQuantity),
          shippedQuantity: BigInt(l.shippedQuantity),
          unitPriceMinorUnits: BigInt(l.unitPriceMinorUnits),
          lineTotalMinorUnits: BigInt(l.lineTotalMinorUnits),
          currency: l.currency,
        })),
        memo: so.memo,
      })
    })
  }

  async createShipment(
    input: CreateShipmentInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      ShipmentSnapshot,
      | SalesOrderNotFoundError
      | InvalidSalesOrderStateError
      | ShipmentError
      | AccountsReceivablePostingError
    >
  > {
    return runInTransaction<
      ShipmentSnapshot,
      | SalesOrderNotFoundError
      | InvalidSalesOrderStateError
      | ShipmentError
      | AccountsReceivablePostingError
    >(this.shipmentRepo.manager, options, async (client) => {
      const so = await client.findOne(SalesOrderEntity, {
        where: { id: input.salesOrderId },
        relations: ['lines'],
      })

      if (!so) {
        return err(new SalesOrderNotFoundError(input.salesOrderId))
      }

      if (so.status !== 'CONFIRMED') {
        return err(new InvalidSalesOrderStateError(so.status, 'ship'))
      }

      const linesToShip: ShipmentLineSnapshot[] = []
      let totalShippedNetMinorUnits = 0n
      let totalCogsMinorUnits = 0n

      const soLinesMap = new Map((so.lines ?? []).map((l) => [l.itemId, l]))

      if (input.lines && input.lines.length > 0) {
        for (const reqLine of input.lines) {
          const soLine = soLinesMap.get(reqLine.itemId)
          if (!soLine) {
            return err(new ShipmentError(`Item ${reqLine.itemId} does not belong to sales order`))
          }
          const remaining = BigInt(soLine.orderedQuantity) - BigInt(soLine.shippedQuantity)
          if (reqLine.shippedQuantity > remaining) {
            return err(
              new ShipmentError(
                `Shipped quantity ${reqLine.shippedQuantity} exceeds remaining ${remaining} for item ${reqLine.itemId}`
              )
            )
          }
          const unitPrice = BigInt(soLine.unitPriceMinorUnits)
          const lineTotal = reqLine.shippedQuantity * unitPrice
          linesToShip.push({
            itemId: reqLine.itemId,
            shippedQuantity: reqLine.shippedQuantity,
            unitPriceMinorUnits: unitPrice,
            lineTotalMinorUnits: lineTotal,
          })
          totalShippedNetMinorUnits += lineTotal
        }
      } else {
        for (const soLine of so.lines ?? []) {
          const remaining = BigInt(soLine.orderedQuantity) - BigInt(soLine.shippedQuantity)
          if (remaining > 0n) {
            const unitPrice = BigInt(soLine.unitPriceMinorUnits)
            const lineTotal = remaining * unitPrice
            linesToShip.push({
              itemId: soLine.itemId,
              shippedQuantity: remaining,
              unitPriceMinorUnits: unitPrice,
              lineTotalMinorUnits: lineTotal,
            })
            totalShippedNetMinorUnits += lineTotal
          }
        }
      }

      if (linesToShip.length === 0) {
        return err(new ShipmentError('No items remaining to ship'))
      }

      {
        for (const shipLine of linesToShip) {
          const stockRes = await this.inventory.stock(
            so.companyId,
            shipLine.itemId,
            input.warehouseId,
            { client }
          )
          if (stockRes.isErr) return err(new ShipmentError(stockRes.error.message))

          const unitCost = stockRes.value.averageUnitCostMinorUnits
          const currency = stockRes.value.currency ?? 'TWD'
          totalCogsMinorUnits += shipLine.shippedQuantity * unitCost

          const movRes = await this.inventory.recordMovement(
            {
              id: `mov-${input.id}-${shipLine.itemId}`,
              companyId: so.companyId,
              itemId: shipLine.itemId,
              warehouseId: input.warehouseId,
              sourceType: 'SALES_SHIPMENT',
              sourceId: input.id,
              quantityDelta: -shipLine.shippedQuantity,
              unitCostMinorUnits: unitCost,
              currency,
              occurredAt: new Date(input.shipmentDate),
            },
            { client }
          )
          if (movRes.isErr) return err(new ShipmentError(movRes.error.message))

          const resId = `res-${so.id}-${shipLine.itemId}`
          await this.inventory.releaseReservation(resId, { client })
        }
      }

      const shippedTaxMinorUnits =
        (totalShippedNetMinorUnits * BigInt(so.taxRateBasisPoints) + 5000n) / 10000n
      const shippedTotalMinorUnits = totalShippedNetMinorUnits + shippedTaxMinorUnits

      const currency = so.lines?.[0]?.currency ?? 'TWD'
      const arVoucherId = input.arVoucherId ?? `je-ar-${input.id}`
      const cogsVoucherId = input.cogsVoucherId ?? `je-cogs-${input.id}`

      {
        const zeroRes = Money.zero(currency)
        const arDebitRes = Money.fromMinorUnits(shippedTotalMinorUnits, currency)
        const revCreditRes = Money.fromMinorUnits(totalShippedNetMinorUnits, currency)

        if (zeroRes.isErr || arDebitRes.isErr || revCreditRes.isErr) {
          return err(new AccountsReceivablePostingError('Failed to create AR money amounts'))
        }
        const zero = zeroRes.value

        const arLines: JournalLine[] = [
          {
            accountId: 'account-ar-receivable',
            debit: arDebitRes.value,
            credit: zero,
            memo: `AR Customer Receivable for SO ${so.number}`,
          },
          {
            accountId: 'account-sales-revenue',
            debit: zero,
            credit: revCreditRes.value,
            memo: `Sales Revenue for SO ${so.number}`,
          },
        ]

        if (shippedTaxMinorUnits > 0n) {
          const taxCreditRes = Money.fromMinorUnits(shippedTaxMinorUnits, currency)
          if (taxCreditRes.isErr) {
            return err(new AccountsReceivablePostingError('Failed to create tax money amount'))
          }
          arLines.push({
            accountId: 'account-tax-output',
            debit: zero,
            credit: taxCreditRes.value,
            memo: `Output Tax 5% for SO ${so.number}`,
          })
        }

        const arDraftRes = await this.finance.createDraft(
          {
            id: arVoucherId,
            companyId: so.companyId,
            number: `JE-AR-${so.number}`,
            accountingDate: input.shipmentDate,
            memo: `AR Invoice for Shipment ${input.id}`,
            lines: arLines,
          },
          { client }
        )
        if (arDraftRes.isErr) {
          return err(
            new AccountsReceivablePostingError(
              `AR Finance draft failed: ${arDraftRes.error.message}`
            )
          )
        }

        if (totalCogsMinorUnits > 0n) {
          const cogsDebitRes = Money.fromMinorUnits(totalCogsMinorUnits, currency)
          const invCreditRes = Money.fromMinorUnits(totalCogsMinorUnits, currency)
          if (cogsDebitRes.isOk && invCreditRes.isOk) {
            const cogsLines: JournalLine[] = [
              {
                accountId: 'account-cogs',
                debit: cogsDebitRes.value,
                credit: zero,
                memo: `COGS for SO ${so.number}`,
              },
              {
                accountId: 'account-inventory',
                debit: zero,
                credit: invCreditRes.value,
                memo: `Inventory reduction for SO ${so.number}`,
              },
            ]
            const cogsDraftRes = await this.finance.createDraft(
              {
                id: cogsVoucherId,
                companyId: so.companyId,
                number: `JE-COGS-${so.number}`,
                accountingDate: input.shipmentDate,
                memo: `COGS Voucher for Shipment ${input.id}`,
                lines: cogsLines,
              },
              { client }
            )
            if (cogsDraftRes.isErr) {
              return err(new AccountsReceivablePostingError(cogsDraftRes.error.message))
            }
          }
        }
      }

      // Update Customer outstanding
      const customer = await client.findOne(CustomerEntity, { where: { id: so.customerId } })
      if (customer) {
        customer.currentOutstandingMinorUnits = (
          BigInt(customer.currentOutstandingMinorUnits) + shippedTotalMinorUnits
        ).toString()
        await client.save(customer)
      }

      // Update SO lines
      const shippedQtyByItem = new Map(linesToShip.map((l) => [l.itemId, l.shippedQuantity]))
      let allLinesFulfilled = true
      for (const soLine of so.lines ?? []) {
        const added = shippedQtyByItem.get(soLine.itemId) ?? 0n
        const newShipped = BigInt(soLine.shippedQuantity) + added
        soLine.shippedQuantity = newShipped.toString()
        await client.save(soLine)
        if (newShipped < BigInt(soLine.orderedQuantity)) {
          allLinesFulfilled = false
        }
      }

      if (allLinesFulfilled) {
        so.status = 'SHIPPED'
        await client.save(so)
      }

      const shipment = client.create(ShipmentEntity, {
        id: input.id,
        salesOrderId: so.id,
        companyId: so.companyId,
        customerId: so.customerId,
        warehouseId: input.warehouseId,
        shipmentDate: input.shipmentDate,
        status: 'SHIPPED',
        arJournalEntryId: arVoucherId,
        cogsJournalEntryId: totalCogsMinorUnits > 0n ? cogsVoucherId : undefined,
        totalShippedAmountMinorUnits: shippedTotalMinorUnits.toString(),
      })
      await client.save(shipment)

      const lineEntities = linesToShip.map((l) =>
        client.create(ShipmentLineEntity, {
          shipmentId: input.id,
          itemId: l.itemId,
          shippedQuantity: l.shippedQuantity.toString(),
          unitPriceMinorUnits: l.unitPriceMinorUnits.toString(),
          lineTotalMinorUnits: l.lineTotalMinorUnits.toString(),
        })
      )
      await client.save(lineEntities)

      const shippedAt = new Date()
      const eventResult = await this.outbox.enqueue(
        SalesOrderShippedEvent.EVENT_NAME,
        new SalesOrderShippedEvent(
          shipment.id,
          so.id,
          so.companyId,
          so.customerId,
          shippedTotalMinorUnits,
          shippedAt
        ),
        { client }
      )
      if (eventResult.isErr) return err(new ShipmentError(eventResult.error.message))

      return ok({
        id: shipment.id,
        salesOrderId: so.id,
        companyId: so.companyId,
        customerId: so.customerId,
        warehouseId: input.warehouseId,
        shipmentDate: input.shipmentDate,
        status: 'SHIPPED',
        arJournalEntryId: arVoucherId,
        cogsJournalEntryId: totalCogsMinorUnits > 0n ? cogsVoucherId : undefined,
        totalShippedAmountMinorUnits: shippedTotalMinorUnits,
        lines: linesToShip,
        shippedAt,
      })
    })
  }
}
