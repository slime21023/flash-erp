import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
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
  type SalesOrderLineSnapshot,
  type SalesOrderSnapshot,
  type ShipmentLineSnapshot,
  type ShipmentSnapshot,
} from '../contracts/index.js'

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

    if (!id || !companyId || !code || !name) {
      return err(new SalesError('Customer id, companyId, code, and name are required'))
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
      currency: input.currency || 'TWD',
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

    const netAmountMinorUnits = processedLines.reduce((sum, l) => sum + l.lineTotalMinorUnits, 0n)
    const taxRateBps = input.taxRateBasisPoints ?? 500
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
        const resId = `res-${so.id}-${line.itemId}`
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
    const so = this.#salesOrders.get(input.salesOrderId)
    if (!so) {
      return err(new SalesOrderNotFoundError(input.salesOrderId))
    }

    if (so.status !== 'CONFIRMED') {
      return err(new InvalidSalesOrderStateError(so.status, 'ship'))
    }

    const linesToShip: ShipmentLineSnapshot[] = []
    let totalShippedNetMinorUnits = 0n
    let totalCogsMinorUnits = 0n

    const soLinesMap = new Map(so.lines.map((l) => [l.itemId, l]))

    if (input.lines && input.lines.length > 0) {
      for (const reqLine of input.lines) {
        const soLine = soLinesMap.get(reqLine.itemId)
        if (!soLine) {
          return err(new ShipmentError(`Item ${reqLine.itemId} does not belong to sales order`))
        }
        const remaining = soLine.orderedQuantity - soLine.shippedQuantity
        if (reqLine.shippedQuantity > remaining) {
          return err(
            new ShipmentError(
              `Shipped quantity ${reqLine.shippedQuantity} exceeds remaining ${remaining} for item ${reqLine.itemId}`
            )
          )
        }
        const lineTotal = reqLine.shippedQuantity * soLine.unitPriceMinorUnits
        linesToShip.push({
          itemId: reqLine.itemId,
          shippedQuantity: reqLine.shippedQuantity,
          unitPriceMinorUnits: soLine.unitPriceMinorUnits,
          lineTotalMinorUnits: lineTotal,
        })
        totalShippedNetMinorUnits += lineTotal
      }
    } else {
      // Ship all remaining
      for (const soLine of so.lines) {
        const remaining = soLine.orderedQuantity - soLine.shippedQuantity
        if (remaining > 0n) {
          const lineTotal = remaining * soLine.unitPriceMinorUnits
          linesToShip.push({
            itemId: soLine.itemId,
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
        const stockRes = await this.inventory.stock(
          so.companyId,
          shipLine.itemId,
          input.warehouseId,
          options
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
          options
        )
        if (movRes.isErr) return err(new ShipmentError(movRes.error.message))

        // Release reservation
        const resId = `res-${so.id}-${shipLine.itemId}`
        await this.inventory.releaseReservation(resId, options)
      }
    }

    // 2. Tax and AR calculations
    const shippedTaxMinorUnits =
      (totalShippedNetMinorUnits * BigInt(so.taxRateBasisPoints) + 5000n) / 10000n
    const shippedTotalMinorUnits = totalShippedNetMinorUnits + shippedTaxMinorUnits

    const currency = so.lines[0]?.currency ?? 'TWD'
    const arVoucherId = input.arVoucherId ?? `je-ar-${input.id}`
    const cogsVoucherId = input.cogsVoucherId ?? `je-cogs-${input.id}`

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
          number: `JE-AR-${so.number}`,
          accountingDate: input.shipmentDate,
          memo: `AR Invoice for Shipment ${input.id}`,
          lines: arLines,
        },
        options
      )
      if (arDraftRes.isErr) {
        return err(
          new AccountsReceivablePostingError(`AR Finance draft failed: ${arDraftRes.error.message}`)
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
              number: `JE-COGS-${so.number}`,
              accountingDate: input.shipmentDate,
              memo: `COGS Voucher for Shipment ${input.id}`,
              lines: cogsLines,
            },
            options
          )
          if (cogsDraftRes.isErr) {
            return err(new AccountsReceivablePostingError(cogsDraftRes.error.message))
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
    const shippedQtyByItem = new Map(linesToShip.map((l) => [l.itemId, l.shippedQuantity]))
    const updatedSoLines = so.lines.map((l) => {
      const added = shippedQtyByItem.get(l.itemId) ?? 0n
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
      id: input.id,
      salesOrderId: so.id,
      companyId: so.companyId,
      customerId: so.customerId,
      warehouseId: input.warehouseId,
      shipmentDate: input.shipmentDate,
      status: 'SHIPPED',
      arJournalEntryId: arVoucherId,
      cogsJournalEntryId: totalCogsMinorUnits > 0n ? cogsVoucherId : undefined,
      totalShippedAmountMinorUnits: shippedTotalMinorUnits,
      lines: Object.freeze(linesToShip),
      shippedAt: new Date(),
    })

    this.#shipments.set(input.id, shipment)
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
