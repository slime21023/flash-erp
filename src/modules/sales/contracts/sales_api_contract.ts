import * as v from 'valibot'
import {
  apiBase,
  currencySchema,
  dateSchema,
  domainErrors,
  idSchema,
  integerStringSchema,
  timestampSchema,
  unsignedIntegerStringSchema,
} from '../../../platform/http/api_schemas.js'

const text = v.pipe(v.string(), v.minLength(1))
const optionalText = v.nullish(v.string(), () => undefined)
const nullableText = v.nullish(v.string())
const taxRate = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000))
const customerInput = {
  id: idSchema,
  companyId: idSchema,
  code: text,
  name: text,
  paymentTerms: optionalText,
  currency: currencySchema,
  creditLimitMinorUnits: unsignedIntegerStringSchema,
}
const customer = v.object({
  ...customerInput,
  paymentTerms: nullableText,
  currency: v.nullish(currencySchema),
  currentOutstandingMinorUnits: integerStringSchema,
  isActive: v.boolean(),
})
const orderLine = v.strictObject({
  itemId: idSchema,
  warehouseId: idSchema,
  orderedQuantity: unsignedIntegerStringSchema,
  unitPriceMinorUnits: unsignedIntegerStringSchema,
  currency: currencySchema,
})
const order = v.object({
  id: idSchema,
  companyId: idSchema,
  customerId: idSchema,
  number: text,
  status: v.picklist(['DRAFT', 'CONFIRMED', 'SHIPPED', 'CLOSED', 'VOID']),
  taxRateBasisPoints: taxRate,
  netAmountMinorUnits: integerStringSchema,
  taxAmountMinorUnits: integerStringSchema,
  totalAmountMinorUnits: integerStringSchema,
  reservationIds: v.array(idSchema),
  lines: v.array(
    v.object({
      ...orderLine.entries,
      shippedQuantity: integerStringSchema,
      lineTotalMinorUnits: integerStringSchema,
    })
  ),
  memo: nullableText,
})
const creditDetails = v.object({
  customerId: idSchema,
  creditLimitMinorUnits: integerStringSchema,
  currentOutstandingMinorUnits: integerStringSchema,
  pendingOrdersMinorUnits: integerStringSchema,
  requestedOrderAmountMinorUnits: integerStringSchema,
  excessMinorUnits: integerStringSchema,
})

export const salesApiContract = {
  registerCustomer: apiBase
    .route({ method: 'POST', path: '/api/sales/customers', successStatus: 201, tags: ['Sales'] })
    .input(v.strictObject(customerInput))
    .output(customer)
    .errors(domainErrors(['SALES_ERROR', 'CUSTOMER_ALREADY_EXISTS', 'SCOPE_FORBIDDEN'])),
  checkCredit: apiBase
    .route({ method: 'GET', path: '/api/sales/customers/{id}/credit-check', tags: ['Sales'] })
    .input(
      v.strictObject({
        id: idSchema,
        additionalAmount: v.nullish(unsignedIntegerStringSchema, () => undefined),
      })
    )
    .output(
      v.object({
        customerId: idSchema,
        creditLimitMinorUnits: integerStringSchema,
        currentOutstandingMinorUnits: integerStringSchema,
        pendingOrdersMinorUnits: integerStringSchema,
        totalExposureMinorUnits: integerStringSchema,
        isApproved: v.boolean(),
        excessMinorUnits: integerStringSchema,
      })
    )
    .errors(domainErrors(['CUSTOMER_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  getCustomer: apiBase
    .route({ method: 'GET', path: '/api/sales/customers/{id}', tags: ['Sales'] })
    .input(v.strictObject({ id: idSchema }))
    .output(customer)
    .errors(domainErrors(['CUSTOMER_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  createSalesOrder: apiBase
    .route({ method: 'POST', path: '/api/sales/orders', successStatus: 201, tags: ['Sales'] })
    .input(
      v.strictObject({
        id: idSchema,
        companyId: idSchema,
        customerId: idSchema,
        number: text,
        memo: optionalText,
        taxRateBasisPoints: v.nullish(taxRate, () => undefined),
        lines: v.pipe(v.array(orderLine), v.minLength(1)),
      })
    )
    .output(order)
    .errors(domainErrors(['SALES_ERROR', 'CUSTOMER_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  getSalesOrder: apiBase
    .route({ method: 'GET', path: '/api/sales/orders/{id}', tags: ['Sales'] })
    .input(v.strictObject({ id: idSchema }))
    .output(order)
    .errors(domainErrors(['SALES_ORDER_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  confirmOrder: apiBase
    .route({ method: 'POST', path: '/api/sales/orders/{id}/confirm', tags: ['Sales'] })
    .input(v.strictObject({ id: idSchema }))
    .output(order)
    .errors({
      ...domainErrors([
        'SALES_ORDER_NOT_FOUND',
        'INVALID_SALES_ORDER_STATE',
        'CUSTOMER_NOT_FOUND',
        'SALES_ERROR',
        'SCOPE_FORBIDDEN',
      ]),
      CREDIT_LIMIT_EXCEEDED: { status: 422, data: creditDetails },
      INSUFFICIENT_STOCK: {
        status: 422,
        data: v.object({
          skuOrId: v.string(),
          requested: integerStringSchema,
          available: integerStringSchema,
        }),
      },
    }),
  createShipment: apiBase
    .route({ method: 'POST', path: '/api/sales/shipments', successStatus: 201, tags: ['Sales'] })
    .input(
      v.strictObject({
        id: idSchema,
        salesOrderId: idSchema,
        warehouseId: idSchema,
        shipmentDate: dateSchema,
        arVoucherId: v.nullish(idSchema, () => undefined),
        cogsVoucherId: v.nullish(idSchema, () => undefined),
        lines: v.nullish(
          v.array(
            v.strictObject({
              itemId: idSchema,
              shippedQuantity: unsignedIntegerStringSchema,
            })
          ),
          () => undefined
        ),
      })
    )
    .output(
      v.object({
        id: idSchema,
        salesOrderId: idSchema,
        companyId: idSchema,
        customerId: idSchema,
        warehouseId: idSchema,
        shipmentDate: dateSchema,
        status: v.literal('SHIPPED'),
        arJournalEntryId: v.nullish(idSchema),
        cogsJournalEntryId: v.nullish(idSchema),
        totalShippedAmountMinorUnits: integerStringSchema,
        lines: v.array(
          v.object({
            itemId: idSchema,
            shippedQuantity: integerStringSchema,
            unitPriceMinorUnits: integerStringSchema,
            lineTotalMinorUnits: integerStringSchema,
          })
        ),
        shippedAt: timestampSchema,
      })
    )
    .errors(
      domainErrors([
        'SALES_ORDER_NOT_FOUND',
        'INVALID_SALES_ORDER_STATE',
        'SHIPMENT_ERROR',
        'ACCOUNTS_RECEIVABLE_POSTING_ERROR',
        'SCOPE_FORBIDDEN',
      ])
    ),
}
