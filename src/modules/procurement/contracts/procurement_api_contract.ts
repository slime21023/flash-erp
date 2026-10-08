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
const basisPoints = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000))
const idInput = v.strictObject({ id: idSchema })
const supplierInput = v.strictObject({ id: idSchema, companyId: idSchema, code: text, name: text })
const poLine = v.strictObject({
  itemId: idSchema,
  orderedQuantity: unsignedIntegerStringSchema,
  unitCostMinorUnits: unsignedIntegerStringSchema,
  currency: currencySchema,
})
const poInput = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  supplierId: idSchema,
  number: text,
  lines: v.pipe(v.array(poLine), v.minLength(1)),
})
const po = v.object({
  ...poInput.entries,
  status: v.picklist(['DRAFT', 'APPROVED', 'CLOSED', 'VOID']),
  approval: v.nullable(
    v.object({
      status: v.picklist(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
      currentStepId: v.nullable(idSchema),
      requiredRole: v.nullable(idSchema),
      history: v.array(
        v.object({
          stepId: idSchema,
          approverId: idSchema,
          role: idSchema,
          decision: v.picklist(['APPROVED', 'REJECTED']),
          comment: v.optional(v.string()),
          decidedAt: timestampSchema,
        })
      ),
    })
  ),
})
const requisitionLine = v.strictObject({
  itemId: idSchema,
  requestedQuantity: unsignedIntegerStringSchema,
  estimatedCostMinorUnits: unsignedIntegerStringSchema,
  currency: currencySchema,
})
const requisitionInput = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  requesterId: idSchema,
  number: text,
  memo: optionalText,
  lines: v.pipe(v.array(requisitionLine), v.minLength(1)),
})
const requisition = v.object({
  ...requisitionInput.entries,
  memo: nullableText,
  status: v.picklist(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED']),
  convertedPurchaseOrderId: v.nullish(idSchema),
})
const receiptLine = v.strictObject({
  itemId: idSchema,
  receivedQuantity: unsignedIntegerStringSchema,
})
const invoiceLine = v.strictObject({
  itemId: idSchema,
  invoicedQuantity: unsignedIntegerStringSchema,
  unitPriceMinorUnits: unsignedIntegerStringSchema,
})
const invoiceInput = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  supplierId: idSchema,
  purchaseOrderId: idSchema,
  invoiceNumber: text,
  invoiceDate: dateSchema,
  currency: currencySchema,
  taxRateBasisPoints: v.nullish(basisPoints, () => undefined),
  lines: v.pipe(v.array(invoiceLine), v.minLength(1)),
})
const approvalErrors = domainErrors([
  'APPROVAL_PUBLICATION_ERROR',
  'INVALID_APPROVAL_STATE',
  'PIPELINE_TERMINATED',
  'INVALID_APPROVAL_STEP',
  'UNAUTHORIZED_APPROVER',
  'DUPLICATE_APPROVAL',
])

export const procurementApiContract = {
  registerSupplier: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/suppliers',
      successStatus: 201,
      tags: ['Procurement'],
    })
    .input(supplierInput)
    .output(v.object({ ...supplierInput.entries, isActive: v.boolean() }))
    .errors(domainErrors(['PROCUREMENT_ERROR', 'SUPPLIER_ALREADY_EXISTS', 'SCOPE_FORBIDDEN'])),
  createPO: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/purchase-orders',
      successStatus: 201,
      tags: ['Procurement'],
    })
    .input(poInput)
    .output(po)
    .errors(domainErrors(['PROCUREMENT_ERROR', 'SUPPLIER_NOT_FOUND', 'SCOPE_FORBIDDEN'])),
  getPO: apiBase
    .route({ method: 'GET', path: '/api/procurement/purchase-orders/{id}', tags: ['Procurement'] })
    .input(idInput)
    .output(po)
    .errors(
      domainErrors(['PURCHASE_ORDER_NOT_FOUND', 'INVALID_APPROVAL_STATE', 'SCOPE_FORBIDDEN'])
    ),
  approvePO: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/purchase-orders/{id}/approve',
      tags: ['Procurement'],
    })
    .input(v.strictObject({ id: idSchema, expectedStepId: idSchema, comment: optionalText }))
    .output(po)
    .errors({
      ...approvalErrors,
      ...domainErrors([
        'PURCHASE_ORDER_NOT_FOUND',
        'INVALID_PURCHASE_ORDER_STATE',
        'SCOPE_FORBIDDEN',
      ]),
    }),
  receiveGoods: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/goods-receipts',
      successStatus: 201,
      tags: ['Procurement'],
    })
    .input(
      v.strictObject({
        id: idSchema,
        purchaseOrderId: idSchema,
        warehouseId: idSchema,
        receivedAt: timestampSchema,
        lines: v.nullish(v.array(receiptLine), () => undefined),
      })
    )
    .output(
      v.object({
        id: idSchema,
        purchaseOrderId: idSchema,
        warehouseId: idSchema,
        receivedAt: timestampSchema,
        lines: v.array(receiptLine),
      })
    )
    .errors(
      domainErrors([
        'PURCHASE_ORDER_NOT_FOUND',
        'INVALID_PURCHASE_ORDER_STATE',
        'PROCUREMENT_ERROR',
        'SCOPE_FORBIDDEN',
      ])
    ),
  createRequisition: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/requisitions',
      successStatus: 201,
      tags: ['Procurement'],
    })
    .input(requisitionInput)
    .output(requisition)
    .errors(domainErrors(['PROCUREMENT_ERROR', 'SCOPE_FORBIDDEN'])),
  submitRequisition: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/requisitions/{id}/submit',
      tags: ['Procurement'],
    })
    .input(idInput)
    .output(requisition)
    .errors(
      domainErrors([
        'PURCHASE_REQUISITION_NOT_FOUND',
        'INVALID_PURCHASE_REQUISITION_STATE',
        'SCOPE_FORBIDDEN',
      ])
    ),
  approveRequisition: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/requisitions/{id}/approve',
      tags: ['Procurement'],
    })
    .input(v.strictObject({ id: idSchema, comment: optionalText }))
    .output(requisition)
    .errors({
      ...approvalErrors,
      ...domainErrors([
        'PURCHASE_REQUISITION_NOT_FOUND',
        'INVALID_PURCHASE_REQUISITION_STATE',
        'SCOPE_FORBIDDEN',
      ]),
    }),
  convertRequisition: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/requisitions/{id}/convert',
      successStatus: 201,
      tags: ['Procurement'],
    })
    .input(
      v.strictObject({
        id: idSchema,
        purchaseOrderId: idSchema,
        purchaseOrderNumber: text,
        supplierId: idSchema,
      })
    )
    .output(po)
    .errors(
      domainErrors([
        'PURCHASE_REQUISITION_NOT_FOUND',
        'INVALID_PURCHASE_REQUISITION_STATE',
        'SUPPLIER_NOT_FOUND',
        'PROCUREMENT_ERROR',
        'SCOPE_FORBIDDEN',
      ])
    ),
  registerInvoice: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/invoices',
      successStatus: 201,
      tags: ['Procurement'],
    })
    .input(invoiceInput)
    .output(
      v.object({
        ...invoiceInput.entries,
        taxRateBasisPoints: basisPoints,
        netAmountMinorUnits: integerStringSchema,
        taxAmountMinorUnits: integerStringSchema,
        totalAmountMinorUnits: integerStringSchema,
        status: v.picklist(['RECEIVED', 'MATCHED', 'POSTED', 'DISPUTED', 'VOID']),
        matchedAt: v.nullish(timestampSchema),
        journalEntryId: v.nullish(idSchema),
        lines: v.array(
          v.object({ ...invoiceLine.entries, lineTotalMinorUnits: integerStringSchema })
        ),
      })
    )
    .errors(
      domainErrors([
        'PURCHASE_ORDER_NOT_FOUND',
        'SUPPLIER_NOT_FOUND',
        'VENDOR_INVOICE_ALREADY_EXISTS',
        'PROCUREMENT_ERROR',
        'SCOPE_FORBIDDEN',
      ])
    ),
  matchInvoice: apiBase
    .route({ method: 'POST', path: '/api/procurement/invoices/{id}/match', tags: ['Procurement'] })
    .input(
      v.strictObject({
        id: idSchema,
        quantityToleranceBasisPoints: v.nullish(basisPoints, () => undefined),
        priceToleranceBasisPoints: v.nullish(basisPoints, () => undefined),
        amountToleranceMinorUnits: v.nullish(unsignedIntegerStringSchema, () => undefined),
      })
    )
    .output(
      v.object({
        invoiceId: idSchema,
        purchaseOrderId: idSchema,
        isMatched: v.boolean(),
        status: v.picklist(['MATCHED', 'DISPUTED']),
        totalInvoicedMinorUnits: integerStringSchema,
        totalReceivedMinorUnits: integerStringSchema,
        lineMatches: v.array(
          v.object({
            itemId: idSchema,
            poQuantity: integerStringSchema,
            receivedQuantity: integerStringSchema,
            invoicedQuantity: integerStringSchema,
            poUnitPriceMinorUnits: integerStringSchema,
            invoiceUnitPriceMinorUnits: integerStringSchema,
            quantityDiscrepancy: integerStringSchema,
            priceDiscrepancyMinorUnits: integerStringSchema,
            isMatched: v.boolean(),
            reason: nullableText,
          })
        ),
        matchedAt: timestampSchema,
      })
    )
    .errors({
      ...domainErrors([
        'VENDOR_INVOICE_NOT_FOUND',
        'PURCHASE_ORDER_NOT_FOUND',
        'INVALID_VENDOR_INVOICE_STATE',
        'PROCUREMENT_ERROR',
        'SCOPE_FORBIDDEN',
      ]),
      MATCHING_TOLERANCE_EXCEEDED: {
        status: 422,
        data: v.object({
          invoiceId: idSchema,
          itemId: v.optional(idSchema),
          field: v.picklist(['QUANTITY', 'UNIT_PRICE', 'TOTAL_AMOUNT', 'ITEM_MISMATCH']),
          expected: v.string(),
          actual: v.string(),
          tolerance: v.string(),
          message: v.string(),
        }),
      },
    }),
  createApVoucher: apiBase
    .route({
      method: 'POST',
      path: '/api/procurement/invoices/{id}/voucher',
      successStatus: 201,
      tags: ['Procurement'],
    })
    .input(
      v.strictObject({
        id: idSchema,
        voucherId: idSchema,
        voucherNumber: text,
        accountingDate: dateSchema,
        inventoryAccountId: v.nullish(idSchema, () => undefined),
        taxAccountId: v.nullish(idSchema, () => undefined),
        payableAccountId: v.nullish(idSchema, () => undefined),
        memo: optionalText,
      })
    )
    .output(
      v.object({
        invoiceId: idSchema,
        journalEntryId: idSchema,
        journalEntryNumber: text,
        companyId: idSchema,
        totalAmountMinorUnits: integerStringSchema,
        currency: currencySchema,
        postedAt: timestampSchema,
      })
    )
    .errors(
      domainErrors([
        'VENDOR_INVOICE_NOT_FOUND',
        'INVALID_VENDOR_INVOICE_STATE',
        'ACCOUNTS_PAYABLE_POSTING_ERROR',
        'SCOPE_FORBIDDEN',
      ])
    ),
}
