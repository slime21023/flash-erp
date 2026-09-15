import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import { createHash } from 'node:crypto'
import { Money } from '@platform/kernel/index.js'
import {
  type InventoryContract,
  InsufficientStockError,
} from '@modules/inventory/contracts/index.js'
import type { FinanceContract, JournalLine } from '@modules/finance/contracts/index.js'
import type { EventEmitter2 } from '@nestjs/event-emitter'
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

type ShipmentWorkLine = ShipmentLineSnapshot & {
  warehouseId: string
  reservationId: string
  orderLineKey: string
}

function stableReference(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex')
  return `${prefix}-${digest.slice(0, 48)}`
}

export class InMemorySalesService extends SalesContract {
  readonly #customers = new Map<string, CustomerSnapshot>()
  readonly #salesOrders = new Map<string, SalesOrderSnapshot>()
  readonly #shipments = new Map<string, ShipmentSnapshot>()

  constructor(
    private readonly inventory?: InventoryContract,
    private readonly eventEmitter?: EventEmitter2,
    private readonly finance?: FinanceContract
  ) {
    super()
  }

  async registerCustomer(
    input: RegisterCustomerInput,
    _options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, SalesError | CustomerAlreadyExistsError>> {
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

    if (
      this.#customers.has(id) ||
      [...this.#customers.values()].some((c) => c.companyId === companyId && c.code === code)
    ) {
      return err(new CustomerAlreadyExistsError(code))
    }

    const customer: CustomerSnapshot = Object.freeze({
      id,
      companyId,
      code,
      name,
      paymentTerms: input.paymentTerms || 'NET30',
      currency,
      creditLimitMinorUnits: input.creditLimitMinorUnits,
      currentOutstandingMinorUnits: 0n,
      isActive: true,
    })

    this.#customers.set(id, customer)
    return ok(customer)
  }

  async getCustomer(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, CustomerNotFoundError>> {
    const customer = this.#customers.get(id)
    if (!customer) {
      return err(new CustomerNotFoundError(id))
    }
    return ok(customer)
  }

  async checkCustomerCredit(
    customerId: string,
    additionalOrderAmountMinorUnits = 0n,
    _options?: TransactionOptions
  ): Promise<Result<CustomerCreditCheckResult, CustomerNotFoundError>> {
    const customer = this.#customers.get(customerId)
    if (!customer) {
      return err(new CustomerNotFoundError(customerId))
    }

    let pendingOrdersMinorUnits = 0n
    for (const so of this.#salesOrders.values()) {
      if (so.customerId === customerId && so.status === 'CONFIRMED') {
        pendingOrdersMinorUnits += so.totalAmountMinorUnits
      }
    }

    const totalExposureMinorUnits =
      customer.currentOutstandingMinorUnits +
      pendingOrdersMinorUnits +
      additionalOrderAmountMinorUnits

    const isApproved = totalExposureMinorUnits <= customer.creditLimitMinorUnits
    const excessMinorUnits = isApproved
      ? 0n
      : totalExposureMinorUnits - customer.creditLimitMinorUnits

    return ok({
      customerId,
      creditLimitMinorUnits: customer.creditLimitMinorUnits,
      currentOutstandingMinorUnits: customer.currentOutstandingMinorUnits,
      pendingOrdersMinorUnits,
      totalExposureMinorUnits,
      isApproved,
      excessMinorUnits,
    })
  }

  async settleCustomerReceivable(
    input: SettleCustomerReceivableInput,
    _options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, CustomerNotFoundError | SalesError>> {
    const customer = this.#customers.get(input.customerId.trim())
    if (!customer || customer.companyId !== input.companyId.trim() || !customer.isActive) {
      return err(new CustomerNotFoundError(input.customerId))
    }
    if (input.amountMinorUnits <= 0n || customer.currency !== input.currency.trim().toUpperCase()) {
      return err(new SalesError('Settlement amount or currency is invalid'))
    }
    if (input.amountMinorUnits > customer.currentOutstandingMinorUnits) {
      return err(new SalesError('Settlement exceeds customer outstanding receivable'))
    }

    const settled = Object.freeze({
      ...customer,
      currentOutstandingMinorUnits: customer.currentOutstandingMinorUnits - input.amountMinorUnits,
    })
    this.#customers.set(customer.id, settled)
    return ok(settled)
  }

  async createSalesOrder(
    input: CreateSalesOrderInput,
    _options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesError | CustomerNotFoundError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const customerId = input.customerId.trim()
    const number = input.number.trim()

    if (!id || !companyId || !customerId || !number || input.lines.length === 0) {
      return err(new SalesError('Sales order fields and at least one line are required'))
    }

    const customer = this.#customers.get(customerId)
    if (!customer || !customer.isActive || customer.companyId !== companyId) {
      return err(new CustomerNotFoundError(customerId))
    }

    const taxRateBps = input.taxRateBasisPoints ?? 500
    if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
      return err(new SalesError('Tax rate must be between 0 and 10000 basis points'))
    }

    const currencies = new Set(input.lines.map((line) => line.currency.trim().toUpperCase()))
    if (currencies.size !== 1 || !currencies.has(customer.currency ?? 'TWD')) {
      return err(new SalesError('All sales order lines must use the customer currency'))
    }

    const lineKeys = new Set<string>()
    for (const line of input.lines) {
      const itemId = line.itemId.trim()
      const warehouseId = line.warehouseId.trim()
      if (!itemId || !warehouseId || line.orderedQuantity <= 0n || line.unitPriceMinorUnits < 0n) {
        return err(new SalesError('Line ordered quantity and unit price must be valid'))
      }

      const lineKey = `${itemId}:${warehouseId}`
      if (lineKeys.has(lineKey))
        return err(new SalesError(`Duplicate sales order line: ${lineKey}`))
      lineKeys.add(lineKey)
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

    const so: SalesOrderSnapshot = Object.freeze({
      id,
      companyId,
      customerId,
      number,
      status: 'DRAFT',
      taxRateBasisPoints: taxRateBps,
      netAmountMinorUnits,
      taxAmountMinorUnits,
      totalAmountMinorUnits,
      reservationIds: Object.freeze([]),
      lines: Object.freeze(processedLines),
      memo: input.memo,
    })

    this.#salesOrders.set(id, so)
    return ok(so)
  }

  async getSalesOrder(
    id: string,
    _options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesOrderNotFoundError>> {
    const so = this.#salesOrders.get(id)
    if (!so) {
      return err(new SalesOrderNotFoundError(id))
    }
    return ok(so)
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
    const so = this.#salesOrders.get(id)
    if (!so) {
      return err(new SalesOrderNotFoundError(id))
    }

    if (so.status !== 'DRAFT') {
      return err(new InvalidSalesOrderStateError(so.status, 'confirm'))
    }

    // 1. Check Credit Limit
    const creditCheck = await this.checkCustomerCredit(
      so.customerId,
      so.totalAmountMinorUnits,
      options
    )
    if (creditCheck.isErr) return err(creditCheck.error)

    if (!creditCheck.value.isApproved) {
      return err(
        new CreditLimitExceededError({
          customerId: so.customerId,
          creditLimitMinorUnits: creditCheck.value.creditLimitMinorUnits,
          currentOutstandingMinorUnits: creditCheck.value.currentOutstandingMinorUnits,
          pendingOrdersMinorUnits: creditCheck.value.pendingOrdersMinorUnits,
          requestedOrderAmountMinorUnits: so.totalAmountMinorUnits,
          excessMinorUnits: creditCheck.value.excessMinorUnits,
        })
      )
    }

    // 2. ATP Stock Reservation
    const reservationIds: string[] = []
    if (this.inventory) {
      for (const line of so.lines) {
        const resId = stableReference('res', so.id, line.itemId, line.warehouseId)
        const reserveRes = await this.inventory.reserve(
          {
            id: resId,
            companyId: so.companyId,
            itemId: line.itemId,
            warehouseId: line.warehouseId,
            quantity: line.orderedQuantity,
            referenceType: 'SALES_ORDER',
            referenceId: so.id,
          },
          options
        )

        if (reserveRes.isErr) {
          // Rollback any earlier reservations
          for (const madeId of reservationIds) {
            await this.inventory.releaseReservation(madeId, options)
          }
          if (reserveRes.error instanceof InsufficientStockError) {
            return err(reserveRes.error)
          }
          return err(new SalesError(reserveRes.error.message))
        }
        reservationIds.push(resId)
      }
    }

    const confirmed: SalesOrderSnapshot = Object.freeze({
      ...so,
      status: 'CONFIRMED',
      reservationIds: Object.freeze(reservationIds),
    })

    this.#salesOrders.set(id, confirmed)
    this.eventEmitter?.emit(
      SalesOrderConfirmedEvent.EVENT_NAME,
      new SalesOrderConfirmedEvent(
        confirmed.id,
        confirmed.companyId,
        confirmed.customerId,
        confirmed.totalAmountMinorUnits,
        new Date()
      )
    )

    return ok(confirmed)
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
    const shipmentId = input.id.trim()
    const salesOrderId = input.salesOrderId.trim()
    const shipmentDate = input.shipmentDate.trim()
    if (!shipmentId || !salesOrderId || !/^\d{4}-\d{2}-\d{2}$/.test(shipmentDate)) {
      return err(new ShipmentError('Shipment id, order, warehouse, and ISO date are required'))
    }
    if (this.#shipments.has(shipmentId)) {
      return err(new ShipmentError(`Shipment already exists: ${shipmentId}`))
    }

    const so = this.#salesOrders.get(salesOrderId)
    if (!so) {
      return err(new SalesOrderNotFoundError(salesOrderId))
    }

    if (so.status !== 'CONFIRMED') {
      return err(new InvalidSalesOrderStateError(so.status, 'ship'))
    }

    const warehouseId = input.warehouseId.trim()
    if (!warehouseId) return err(new ShipmentError('warehouseId is required'))

    const linesToShip: ShipmentWorkLine[] = []
    let totalShippedNetMinorUnits = 0n
    let totalCogsMinorUnits = 0n

    const lineKey = (itemId: string, lineWarehouseId: string) => `${itemId}:${lineWarehouseId}`
    const soLinesMap = new Map(
      so.lines.map((l) => [lineKey(l.itemId.trim(), l.warehouseId.trim()), l])
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
        const remaining = soLine.orderedQuantity - soLine.shippedQuantity
        if (reqLine.shippedQuantity > remaining) {
          return err(
            new ShipmentError(
              `Shipped quantity ${reqLine.shippedQuantity} exceeds remaining ${remaining} for item ${itemId}`
            )
          )
        }
        const lineTotal = reqLine.shippedQuantity * soLine.unitPriceMinorUnits
        linesToShip.push({
          itemId,
          warehouseId,
          reservationId: stableReference('res', so.id, soLine.itemId, soLine.warehouseId),
          orderLineKey,
          shippedQuantity: reqLine.shippedQuantity,
          unitPriceMinorUnits: soLine.unitPriceMinorUnits,
          lineTotalMinorUnits: lineTotal,
        })
        totalShippedNetMinorUnits += lineTotal
      }
    } else {
      // Ship all remaining
      for (const soLine of so.lines) {
        if (soLine.warehouseId !== warehouseId) continue
        const remaining = soLine.orderedQuantity - soLine.shippedQuantity
        if (remaining > 0n) {
          const orderLineKey = lineKey(soLine.itemId, soLine.warehouseId)
          const lineTotal = remaining * soLine.unitPriceMinorUnits
          linesToShip.push({
            itemId: soLine.itemId,
            warehouseId: soLine.warehouseId,
            reservationId: stableReference('res', so.id, soLine.itemId, soLine.warehouseId),
            orderLineKey,
            shippedQuantity: remaining,
            unitPriceMinorUnits: soLine.unitPriceMinorUnits,
            lineTotalMinorUnits: lineTotal,
          })
          totalShippedNetMinorUnits += lineTotal
        }
      }
    }

    if (linesToShip.length === 0) {
      return err(new ShipmentError('No items remaining to ship'))
    }

    // 1. Deduct Inventory & Release Reservations
    if (this.inventory) {
      for (const shipLine of linesToShip) {
        const reservationRes = await this.inventory.consumeReservation(
          shipLine.reservationId,
          shipLine.shippedQuantity,
          options
        )
        if (reservationRes.isErr) return err(new ShipmentError(reservationRes.error.message))

        const stockRes = await this.inventory.stock(
          so.companyId,
          shipLine.itemId,
          shipLine.warehouseId,
          options
        )
        if (stockRes.isErr) return err(new ShipmentError(stockRes.error.message))

        const unitCost = stockRes.value.averageUnitCostMinorUnits
        const currency = stockRes.value.currency ?? 'TWD'
        if (currency !== (so.lines[0]?.currency ?? currency)) {
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
          options
        )
        if (movRes.isErr) return err(new ShipmentError(movRes.error.message))
      }
    }

    // 2. Tax and AR calculations
    const shippedTaxMinorUnits =
      (totalShippedNetMinorUnits * BigInt(so.taxRateBasisPoints) + 5000n) / 10000n
    const shippedTotalMinorUnits = totalShippedNetMinorUnits + shippedTaxMinorUnits

    const currency = so.lines[0]?.currency ?? 'TWD'
    const arVoucherId = input.arVoucherId?.trim() || stableReference('je-ar', shipmentId)
    const cogsVoucherId = input.cogsVoucherId?.trim() || stableReference('je-cogs', shipmentId)
    if (arVoucherId === cogsVoucherId) {
      return err(new AccountsReceivablePostingError('AR and COGS voucher IDs must differ'))
    }

    // 3. Post AR & COGS to Finance
    if (this.finance) {
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
        options
      )
      if (arDraftRes.isErr) {
        return err(
          new AccountsReceivablePostingError(`AR Finance draft failed: ${arDraftRes.error.message}`)
        )
      }

      const arPostRes = await this.finance.postDraft(arVoucherId, undefined, options)
      if (arPostRes.isErr) {
        return err(
          new AccountsReceivablePostingError(
            `AR Finance posting failed: ${arPostRes.error.message}`
          )
        )
      }

      // COGS Entry (if totalCogs > 0)
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
            options
          )
          if (cogsDraftRes.isErr) {
            return err(new AccountsReceivablePostingError(cogsDraftRes.error.message))
          }
          const cogsPostRes = await this.finance.postDraft(cogsVoucherId, undefined, options)
          if (cogsPostRes.isErr) {
            return err(new AccountsReceivablePostingError(cogsPostRes.error.message))
          }
        }
      }
    }

    // 4. Update Customer Outstanding AR Balance
    const customer = this.#customers.get(so.customerId)
    if (customer) {
      this.#customers.set(customer.id, {
        ...customer,
        currentOutstandingMinorUnits:
          customer.currentOutstandingMinorUnits + shippedTotalMinorUnits,
      })
    }

    // 5. Update SO lines shipped quantity and check if fully shipped
    const shippedQtyByLine = new Map(linesToShip.map((l) => [l.orderLineKey, l.shippedQuantity]))
    const updatedSoLines = so.lines.map((l) => {
      const added = shippedQtyByLine.get(lineKey(l.itemId, l.warehouseId)) ?? 0n
      return {
        ...l,
        shippedQuantity: l.shippedQuantity + added,
      }
    })

    const isFullyShipped = updatedSoLines.every((l) => l.shippedQuantity >= l.orderedQuantity)
    const updatedSo: SalesOrderSnapshot = Object.freeze({
      ...so,
      status: isFullyShipped ? 'SHIPPED' : 'CONFIRMED',
      lines: Object.freeze(updatedSoLines),
    })
    this.#salesOrders.set(so.id, updatedSo)

    const shipment: ShipmentSnapshot = Object.freeze({
      id: shipmentId,
      salesOrderId: so.id,
      companyId: so.companyId,
      customerId: so.customerId,
      warehouseId,
      shipmentDate,
      status: 'SHIPPED',
      arJournalEntryId: arVoucherId,
      cogsJournalEntryId: totalCogsMinorUnits > 0n ? cogsVoucherId : undefined,
      totalShippedAmountMinorUnits: shippedTotalMinorUnits,
      lines: Object.freeze(
        linesToShip.map(
          ({
            warehouseId: _warehouseId,
            reservationId: _reservationId,
            orderLineKey: _orderLineKey,
            ...line
          }) => line
        )
      ),
      shippedAt: new Date(),
    })

    this.#shipments.set(shipmentId, shipment)
    this.eventEmitter?.emit(
      SalesOrderShippedEvent.EVENT_NAME,
      new SalesOrderShippedEvent(
        shipment.id,
        so.id,
        so.companyId,
        so.customerId,
        shippedTotalMinorUnits,
        shipment.shippedAt
      )
    )

    return ok(shipment)
  }
}
