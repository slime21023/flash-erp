import * as v from 'valibot'
import {
  apiBase,
  dateSchema,
  domainErrors,
  idSchema,
  timestampSchema,
  unsignedIntegerStringSchema,
} from '../../../platform/http/api_schemas.js'

const bomLineInputSchema = v.strictObject({
  componentItemId: idSchema,
  quantityPerBase: unsignedIntegerStringSchema,
  scrapPercentageBasisPoints: v.nullish(v.pipe(v.number(), v.integer()), () => undefined),
  memo: v.nullish(v.string(), () => undefined),
})
const bomInputSchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  code: idSchema,
  name: idSchema,
  parentItemId: idSchema,
  baseQuantity: v.nullish(unsignedIntegerStringSchema, '1'),
  lines: v.array(bomLineInputSchema),
})

export const bomSchema = v.strictObject({
  ...bomInputSchema.entries,
  baseQuantity: unsignedIntegerStringSchema,
  lines: v.array(
    v.strictObject({
      componentItemId: idSchema,
      quantityPerBase: unsignedIntegerStringSchema,
      scrapPercentageBasisPoints: v.pipe(
        v.number(),
        v.integer(),
        v.minValue(0),
        v.maxValue(10_000)
      ),
      memo: v.nullish(v.string()),
    })
  ),
})

export const workOrderSchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  workOrderNumber: idSchema,
  bomId: idSchema,
  outputItemId: idSchema,
  outputWarehouseId: idSchema,
  rawMaterialWarehouseId: idSchema,
  targetQuantity: unsignedIntegerStringSchema,
  completedQuantity: unsignedIntegerStringSchema,
  status: v.picklist(['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED']),
  actualDirectMaterialCostMinorUnits: unsignedIntegerStringSchema,
  allocatedOverheadCostMinorUnits: unsignedIntegerStringSchema,
  totalCostMinorUnits: unsignedIntegerStringSchema,
  unitCostMinorUnits: unsignedIntegerStringSchema,
  lines: v.array(
    v.strictObject({
      id: idSchema,
      componentItemId: idSchema,
      warehouseId: idSchema,
      plannedQuantity: unsignedIntegerStringSchema,
      issuedQuantity: unsignedIntegerStringSchema,
    })
  ),
  memo: v.nullish(v.string()),
  completedAt: v.nullish(timestampSchema),
})

export const overheadAllocationSchema = v.strictObject({
  companyId: idSchema,
  totalPoolAmountMinorUnits: unsignedIntegerStringSchema,
  allocations: v.array(
    v.strictObject({
      workOrderId: idSchema,
      allocatedAmountMinorUnits: unsignedIntegerStringSchema,
      newTotalCostMinorUnits: unsignedIntegerStringSchema,
      newUnitCostMinorUnits: unsignedIntegerStringSchema,
    })
  ),
})

const byIdSchema = v.strictObject({ id: idSchema })

export const manufacturingApiContract = {
  registerBom: apiBase
    .route({ method: 'POST', path: '/api/manufacturing/boms', successStatus: 201 })
    .input(bomInputSchema)
    .output(bomSchema)
    .errors(domainErrors(['MANUFACTURING_ERROR', 'BOM_ALREADY_EXISTS', 'CYCLIC_BOM_DEPENDENCY'])),
  getBom: apiBase
    .route({ method: 'GET', path: '/api/manufacturing/boms/{id}' })
    .input(byIdSchema)
    .output(bomSchema)
    .errors(domainErrors(['BOM_NOT_FOUND'])),
  createWorkOrder: apiBase
    .route({ method: 'POST', path: '/api/manufacturing/work-orders', successStatus: 201 })
    .input(
      v.strictObject({
        id: idSchema,
        companyId: idSchema,
        workOrderNumber: idSchema,
        bomId: idSchema,
        outputWarehouseId: idSchema,
        rawMaterialWarehouseId: idSchema,
        targetQuantity: unsignedIntegerStringSchema,
        memo: v.nullish(v.string(), () => undefined),
      })
    )
    .output(workOrderSchema)
    .errors(domainErrors(['MANUFACTURING_ERROR', 'BOM_NOT_FOUND', 'BOM_EXPLOSION_ERROR'])),
  releaseWorkOrder: apiBase
    .route({ method: 'POST', path: '/api/manufacturing/work-orders/{id}/release' })
    .input(byIdSchema)
    .output(workOrderSchema)
    .errors(
      domainErrors(['MANUFACTURING_ERROR', 'WORK_ORDER_NOT_FOUND', 'INVALID_WORK_ORDER_STATE'])
    ),
  issueMaterials: apiBase
    .route({ method: 'POST', path: '/api/manufacturing/work-orders/{id}/issue-materials' })
    .input(
      v.strictObject({
        id: idSchema,
        issueDate: dateSchema,
        lines: v.array(
          v.strictObject({ componentItemId: idSchema, quantity: unsignedIntegerStringSchema })
        ),
      })
    )
    .output(workOrderSchema)
    .errors(
      domainErrors([
        'MANUFACTURING_ERROR',
        'WORK_ORDER_NOT_FOUND',
        'INVALID_WORK_ORDER_STATE',
        'MATERIAL_ISSUE_QUANTITY_EXCEEDED',
      ])
    ),
  completeWorkOrder: apiBase
    .route({ method: 'POST', path: '/api/manufacturing/work-orders/{id}/complete' })
    .input(
      v.strictObject({
        id: idSchema,
        completedQuantity: unsignedIntegerStringSchema,
        completionDate: dateSchema,
      })
    )
    .output(workOrderSchema)
    .errors(
      domainErrors(['MANUFACTURING_ERROR', 'WORK_ORDER_NOT_FOUND', 'INVALID_WORK_ORDER_STATE'])
    ),
  getWorkOrder: apiBase
    .route({ method: 'GET', path: '/api/manufacturing/work-orders/{id}' })
    .input(byIdSchema)
    .output(workOrderSchema)
    .errors(domainErrors(['WORK_ORDER_NOT_FOUND'])),
  allocateOverhead: apiBase
    .route({ method: 'POST', path: '/api/manufacturing/overhead/allocate' })
    .input(
      v.strictObject({
        companyId: idSchema,
        overheadAccount: v.nullish(v.string(), () => undefined),
        totalPoolAmountMinorUnits: unsignedIntegerStringSchema,
        currency: v.nullish(v.string(), () => undefined),
        accountingDate: dateSchema,
        allocationBase: v.picklist(['COMPLETED_QUANTITY', 'DIRECT_MATERIAL_COST']),
        workOrderIds: v.array(v.string()),
      })
    )
    .output(overheadAllocationSchema)
    .errors(
      domainErrors(['MANUFACTURING_ERROR', 'WORK_ORDER_NOT_FOUND', 'OVERHEAD_ALLOCATION_ERROR'])
    ),
}
