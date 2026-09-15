import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { type Result, err, ok } from '@platform/fp/index.js'
import {
  OutboxService,
  type TransactionOptions,
  runInTransaction,
} from '@platform/persistence/index.js'
import { Money } from '@platform/kernel/index.js'
import { scopeMismatch } from '@platform/context/index.js'
import { ScopeForbiddenError } from '@platform/security/index.js'
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
  type SettleCustomerReceivableInput,
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

type ShipmentWorkLine = ShipmentLineSnapshot & {
  warehouseId: string
  reservationId: string
  orderLineKey: string
}

function stableReference(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex')
  return `${prefix}-${digest.slice(0, 48)}`
}

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
  ): Promise<
    Result<CustomerSnapshot, SalesError | CustomerAlreadyExistsError | ScopeForbiddenError>
  > {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()
    const currency = (input.currency || 'TWD').trim().toUpperCase()

    if (!id || !companyId || !code || !name || !/^[A-Z]{3}$/.test(currency)) {
      return err(new SalesError('Customer id, companyId, code, and name are required'))
    }

    if (input.creditLimitMinorUnits < 0n) {
      return err(new SalesError('Credit limit cannot be negative'))
    }

    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'customer'))

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
        currency,
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
  ): Promise<Result<CustomerSnapshot, CustomerNotFoundError | ScopeForbiddenError>> {
    const manager = options?.client ?? this.customerRepo.manager
    const entity = await manager.findOne(CustomerEntity, { where: { id } })
    if (!entity) {
      return err(new CustomerNotFoundError(id))
    }
    const selectedScope = scopeMismatch(entity.companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'customer'))
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
  ): Promise<Result<CustomerCreditCheckResult, CustomerNotFoundError | ScopeForbiddenError>> {
    const manager = options?.client ?? this.customerRepo.manager
    const customer = await manager.findOne(CustomerEntity, { where: { id: customerId } })
    if (!customer) {
      return err(new CustomerNotFoundError(customerId))
    }
    const selectedScope = scopeMismatch(customer.companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'customer credit'))

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

  async settleCustomerReceivable(
    input: SettleCustomerReceivableInput,
    options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, CustomerNotFoundError | SalesError | ScopeForbiddenError>> {
    return runInTransaction<
      CustomerSnapshot,
      CustomerNotFoundError | SalesError | ScopeForbiddenError
    >(this.customerRepo.manager, options, async (client) => {
      const companyId = input.companyId.trim()
      const customerId = input.customerId.trim()
      const currency = input.currency.trim().toUpperCase()
      const referenceId = input.referenceId.trim()
      if (!companyId || !customerId || !currency || !referenceId || input.amountMinorUnits <= 0n) {
        return err(new SalesError('Customer receivable settlement fields are invalid'))
      }

      const customer = await client
        .createQueryBuilder(CustomerEntity, 'customer')
        .setLock('pessimistic_write')
        .where('customer.id = :customerId', { customerId })
        .andWhere('customer.company_id = :companyId', { companyId })
        .andWhere('customer.is_active = true')
        .getOne()
      if (!customer) return err(new CustomerNotFoundError(customerId))
      if (customer.currency !== currency) {
        return err(new SalesError('Settlement currency must match customer currency'))
      }

      const outstanding = BigInt(customer.currentOutstandingMinorUnits)
      if (input.amountMinorUnits > outstanding) {
        return err(new SalesError('Settlement exceeds customer outstanding receivable'))
      }

      customer.currentOutstandingMinorUnits = (outstanding - input.amountMinorUnits).toString()
      await client.save(customer)

      return ok({
        id: customer.id,
        companyId: customer.companyId,
        code: customer.code,
        name: customer.name,
        paymentTerms: customer.paymentTerms,
        currency: customer.currency,
        creditLimitMinorUnits: BigInt(customer.creditLimitMinorUnits),
        currentOutstandingMinorUnits: BigInt(customer.currentOutstandingMinorUnits),
        isActive: customer.isActive,
      })
    })
  }

  async createSalesOrder(
    input: CreateSalesOrderInput,
    options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesError | CustomerNotFoundError | ScopeForbiddenError>> {
    return runInTransaction<
      SalesOrderSnapshot,
      SalesError | CustomerNotFoundError | ScopeForbiddenError
    >(this.soRepo.manager, options, async (client) => {
      const id = input.id.trim()
      const companyId = input.companyId.trim()
      const customerId = input.customerId.trim()
      const number = input.number.trim()

      if (!id || !companyId || !customerId || !number || input.lines.length === 0) {
        return err(new SalesError('Sales order fields and at least one line are required'))
      }

      const selectedScope = scopeMismatch(companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'sales order'))

      const customer = await client.findOne(CustomerEntity, {
        where: { id: customerId, companyId, isActive: true },
      })
      if (!customer) {
        return err(new CustomerNotFoundError(customerId))
      }

      const taxRateBps = input.taxRateBasisPoints ?? 500
      if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
        return err(new SalesError('Tax rate must be between 0 and 10000 basis points'))
      }

      const currencies = new Set(input.lines.map((line) => line.currency.trim().toUpperCase()))
      if (currencies.size !== 1 || !currencies.has(customer.currency)) {
        return err(new SalesError('All sales order lines must use the customer currency'))
      }

      const lineKeys = new Set<string>()
      for (const line of input.lines) {
        const itemId = line.itemId.trim()
        const warehouseId = line.warehouseId.trim()
        if (
          !itemId ||
          !warehouseId ||
          line.orderedQuantity <= 0n ||
          line.unitPriceMinorUnits < 0n
        ) {
          return err(new SalesError('Line ordered quantity and unit price must be valid'))
        }

        const lineKey = `${itemId}:${warehouseId}`
        if (lineKeys.has(lineKey)) {
          return err(new SalesError(`Duplicate sales order line: ${lineKey}`))
        }
        lineKeys.add(lineKey)

        const stockRes = await this.inventory.availableStock(companyId, itemId, warehouseId, {
          client,
        })
        if (stockRes.isErr) return err(new SalesError(stockRes.error.message))
      }

      const processedLines: SalesOrderLineSnapshot[] = input.lines.map((l) => ({
        itemId: l.itemId.trim(),
        warehouseId: l.warehouseId.trim(),
        orderedQuantity: l.orderedQuantity,
        shippedQuantity: 0n,
        unitPriceMinorUnits: l.unitPriceMinorUnits,
        lineTotalMinorUnits: l.orderedQuantity * l.unitPriceMinorUnits,
        currency: l.currency.trim().toUpperCase(),
      }))

      const netAmountMinorUnits = processedLines.reduce((sum, l) => sum + l.lineTotalMinorUnits, 0n)
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
    })
  }

  async getSalesOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesOrderNotFoundError | ScopeForbiddenError>> {
    const manager = options?.client ?? this.soRepo.manager
    const so = await manager.findOne(SalesOrderEntity, {
      where: { id },
      relations: ['lines'],
    })
    if (!so) {
      return err(new SalesOrderNotFoundError(id))
    }
    const selectedScope = scopeMismatch(so.companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'sales order'))
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
      | ScopeForbiddenError
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
      | ScopeForbiddenError
    >(this.soRepo.manager, options, async (client) => {
      const so = await client
        .createQueryBuilder(SalesOrderEntity, 'so')
        .leftJoinAndSelect('so.lines', 'lines')
        .setLock('pessimistic_write')
        .where('so.id = :id', { id })
        .getOne()

      if (!so) {
        return err(new SalesOrderNotFoundError(id))
      }

      const selectedScope = scopeMismatch(so.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'sales order'))

      if (so.status !== 'DRAFT') {
        return err(new InvalidSalesOrderStateError(so.status, 'confirm'))
      }

      const customer = await client
        .createQueryBuilder(CustomerEntity, 'customer')
        .setLock('pessimistic_write')
        .where('customer.id = :id', { id: so.customerId })
        .andWhere('customer.company_id = :companyId', { companyId: so.companyId })
        .andWhere('customer.is_active = true')
        .getOne()
      if (!customer) return err(new CustomerNotFoundError(so.customerId))

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
          const resId = stableReference('res', so.id, line.itemId, line.warehouseId)
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
      | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      ShipmentSnapshot,
      | SalesOrderNotFoundError
      | InvalidSalesOrderStateError
      | ShipmentError
      | AccountsReceivablePostingError
      | ScopeForbiddenError
    >(this.shipmentRepo.manager, options, async (client) => {
      const shipmentId = input.id.trim()
      const salesOrderId = input.salesOrderId.trim()
      const warehouseId = input.warehouseId.trim()
      const shipmentDate = input.shipmentDate.trim()
      if (
        !shipmentId ||
        !salesOrderId ||
        !warehouseId ||
        !/^\d{4}-\d{2}-\d{2}$/.test(shipmentDate)
      ) {
        return err(new ShipmentError('Shipment id, order, warehouse, and ISO date are required'))
      }

      const existingShipment = await client.findOne(ShipmentEntity, { where: { id: shipmentId } })
      if (existingShipment) return err(new ShipmentError(`Shipment already exists: ${shipmentId}`))

      const so = await client
        .createQueryBuilder(SalesOrderEntity, 'so')
        .leftJoinAndSelect('so.lines', 'lines')
        .setLock('pessimistic_write')
        .where('so.id = :id', { id: salesOrderId })
        .getOne()

      if (!so) {
        return err(new SalesOrderNotFoundError(salesOrderId))
      }

      const selectedScope = scopeMismatch(so.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'shipment'))

      if (so.status !== 'CONFIRMED') {
        return err(new InvalidSalesOrderStateError(so.status, 'ship'))
      }

      if (!warehouseId) return err(new ShipmentError('warehouseId is required'))

      const linesToShip: ShipmentWorkLine[] = []
      let totalShippedNetMinorUnits = 0n
      let totalCogsMinorUnits = 0n

      const lineKey = (itemId: string, lineWarehouseId: string) => `${itemId}:${lineWarehouseId}`
      const soLinesMap = new Map(
        (so.lines ?? []).map((l) => [lineKey(l.itemId.trim(), l.warehouseId.trim()), l])
      )

      if (input.lines && input.lines.length > 0) {
        const requestedKeys = new Set<string>()
        for (const reqLine of input.lines) {
          if (reqLine.shippedQuantity <= 0n) {
            return err(new ShipmentError('Shipped quantity must be greater than zero'))
          }

          const itemId = reqLine.itemId.trim()
          const orderLineKey = lineKey(itemId, warehouseId)
          if (requestedKeys.has(orderLineKey)) {
            return err(new ShipmentError(`Duplicate shipment line: ${orderLineKey}`))
          }
          requestedKeys.add(orderLineKey)

          const soLine = soLinesMap.get(orderLineKey)
          if (!soLine) {
            return err(
              new ShipmentError(
                `Item ${itemId} does not belong to sales order warehouse ${warehouseId}`
              )
            )
          }
          const remaining = BigInt(soLine.orderedQuantity) - BigInt(soLine.shippedQuantity)
          if (reqLine.shippedQuantity > remaining) {
            return err(
              new ShipmentError(
                `Shipped quantity ${reqLine.shippedQuantity} exceeds remaining ${remaining} for item ${itemId}`
              )
            )
          }
          const unitPrice = BigInt(soLine.unitPriceMinorUnits)
          const lineTotal = reqLine.shippedQuantity * unitPrice
          linesToShip.push({
            itemId,
            warehouseId,
            reservationId: stableReference('res', so.id, soLine.itemId, soLine.warehouseId),
            orderLineKey,
            shippedQuantity: reqLine.shippedQuantity,
            unitPriceMinorUnits: unitPrice,
            lineTotalMinorUnits: lineTotal,
          })
          totalShippedNetMinorUnits += lineTotal
        }
      } else {
        for (const soLine of so.lines ?? []) {
          if (soLine.warehouseId.trim() !== warehouseId) continue
          const remaining = BigInt(soLine.orderedQuantity) - BigInt(soLine.shippedQuantity)
          if (remaining > 0n) {
            const unitPrice = BigInt(soLine.unitPriceMinorUnits)
            const lineTotal = remaining * unitPrice
            const orderLineKey = lineKey(soLine.itemId, soLine.warehouseId)
            linesToShip.push({
              itemId: soLine.itemId,
              warehouseId: soLine.warehouseId,
              reservationId: stableReference('res', so.id, soLine.itemId, soLine.warehouseId),
              orderLineKey,
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
          const reservationRes = await this.inventory.consumeReservation(
            shipLine.reservationId,
            shipLine.shippedQuantity,
            { client }
          )
          if (reservationRes.isErr) return err(new ShipmentError(reservationRes.error.message))

          const stockRes = await this.inventory.stock(
            so.companyId,
            shipLine.itemId,
            shipLine.warehouseId,
            { client }
          )
          if (stockRes.isErr) return err(new ShipmentError(stockRes.error.message))

          const unitCost = stockRes.value.averageUnitCostMinorUnits
          const currency = stockRes.value.currency ?? 'TWD'
          if (currency !== (so.lines?.[0]?.currency ?? currency)) {
            return err(new ShipmentError('Inventory and sales order currencies must match'))
          }
          totalCogsMinorUnits += shipLine.shippedQuantity * unitCost

          const movRes = await this.inventory.recordMovement(
            {
              id: stableReference('mov', shipmentId, shipLine.itemId, shipLine.warehouseId),
              companyId: so.companyId,
              itemId: shipLine.itemId,
              warehouseId: shipLine.warehouseId,
              sourceType: 'SALES_SHIPMENT',
              sourceId: shipmentId,
              quantityDelta: -shipLine.shippedQuantity,
              unitCostMinorUnits: unitCost,
              currency,
              occurredAt: new Date(shipmentDate),
            },
            { client }
          )
          if (movRes.isErr) return err(new ShipmentError(movRes.error.message))
        }
      }

      const shippedTaxMinorUnits =
        (totalShippedNetMinorUnits * BigInt(so.taxRateBasisPoints) + 5000n) / 10000n
      const shippedTotalMinorUnits = totalShippedNetMinorUnits + shippedTaxMinorUnits

      const currency = so.lines?.[0]?.currency ?? 'TWD'
      const arVoucherId = input.arVoucherId?.trim() || stableReference('je-ar', shipmentId)
      const cogsVoucherId = input.cogsVoucherId?.trim() || stableReference('je-cogs', shipmentId)
      if (
        arVoucherId.length > 64 ||
        cogsVoucherId.length > 64 ||
        (totalCogsMinorUnits > 0n && arVoucherId === cogsVoucherId)
      ) {
        return err(new ShipmentError('Shipment voucher IDs are invalid'))
      }

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
            number: stableReference('JE-AR', shipmentId),
            accountingDate: shipmentDate,
            memo: `AR Invoice for Shipment ${shipmentId}`,
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

        const arPostRes = await this.finance.postDraft(arVoucherId, undefined, { client })
        if (arPostRes.isErr) {
          return err(
            new AccountsReceivablePostingError(
              `AR Finance posting failed: ${arPostRes.error.message}`
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
                number: stableReference('JE-COGS', shipmentId),
                accountingDate: shipmentDate,
                memo: `COGS Voucher for Shipment ${shipmentId}`,
                lines: cogsLines,
              },
              { client }
            )
            if (cogsDraftRes.isErr) {
              return err(new AccountsReceivablePostingError(cogsDraftRes.error.message))
            }

            const cogsPostRes = await this.finance.postDraft(cogsVoucherId, undefined, { client })
            if (cogsPostRes.isErr) {
              return err(new AccountsReceivablePostingError(cogsPostRes.error.message))
            }
          }
        }
      }

      // Update Customer outstanding
      const customer = await client
        .createQueryBuilder(CustomerEntity, 'customer')
        .setLock('pessimistic_write')
        .where('customer.id = :id', { id: so.customerId })
        .andWhere('customer.company_id = :companyId', { companyId: so.companyId })
        .andWhere('customer.is_active = true')
        .getOne()
      if (!customer) return err(new ShipmentError('Sales order customer is not active'))
      customer.currentOutstandingMinorUnits = (
        BigInt(customer.currentOutstandingMinorUnits) + shippedTotalMinorUnits
      ).toString()
      await client.save(customer)

      // Update SO lines
      const shippedQtyByLine = new Map(linesToShip.map((l) => [l.orderLineKey, l.shippedQuantity]))
      let allLinesFulfilled = true
      for (const soLine of so.lines ?? []) {
        const added =
          shippedQtyByLine.get(lineKey(soLine.itemId.trim(), soLine.warehouseId.trim())) ?? 0n
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
        id: shipmentId,
        salesOrderId: so.id,
        companyId: so.companyId,
        customerId: so.customerId,
        warehouseId,
        shipmentDate,
        status: 'SHIPPED',
        arJournalEntryId: arVoucherId,
        cogsJournalEntryId: totalCogsMinorUnits > 0n ? cogsVoucherId : undefined,
        totalShippedAmountMinorUnits: shippedTotalMinorUnits.toString(),
      })
      await client.save(shipment)

      const lineEntities = linesToShip.map((l) =>
        client.create(ShipmentLineEntity, {
          shipmentId,
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
        warehouseId,
        shipmentDate,
        status: 'SHIPPED',
        arJournalEntryId: arVoucherId,
        cogsJournalEntryId: totalCogsMinorUnits > 0n ? cogsVoucherId : undefined,
        totalShippedAmountMinorUnits: shippedTotalMinorUnits,
        lines: linesToShip.map(
          ({
            warehouseId: _warehouseId,
            reservationId: _reservationId,
            orderLineKey: _orderLineKey,
            ...line
          }) => line
        ),
        shippedAt,
      })
    })
  }
}
