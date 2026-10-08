import * as v from 'valibot'
import {
  apiBase,
  currencySchema,
  domainErrors,
  idSchema,
  integerStringSchema,
  timestampSchema,
  unsignedIntegerStringSchema,
} from '../../../platform/http/api_schemas.js'

export const inventoryUnitSchema = v.strictObject({ id: idSchema, code: idSchema, name: idSchema })
export const inventoryItemSchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  sku: idSchema,
  name: idSchema,
  unitId: idSchema,
})
export const inventoryWarehouseSchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  organizationUnitId: idSchema,
  code: idSchema,
  name: idSchema,
})
export const inventoryMovementSchema = v.strictObject({
  id: idSchema,
  companyId: idSchema,
  itemId: idSchema,
  warehouseId: idSchema,
  sourceType: idSchema,
  sourceId: idSchema,
  quantityDelta: integerStringSchema,
  unitCostMinorUnits: unsignedIntegerStringSchema,
  currency: currencySchema,
  occurredAt: timestampSchema,
})
export const inventoryStockSchema = v.strictObject({
  companyId: idSchema,
  itemId: idSchema,
  warehouseId: idSchema,
  quantity: unsignedIntegerStringSchema,
  averageUnitCostMinorUnits: unsignedIntegerStringSchema,
  currency: v.nullable(currencySchema),
})

export const inventoryApiContract = {
  master: {
    unit: apiBase
      .route({ method: 'POST', path: '/api/inventory/units', successStatus: 201 })
      .input(inventoryUnitSchema)
      .output(inventoryUnitSchema)
      .errors(domainErrors(['INVENTORY_MOVEMENT_INVALID'])),
    item: apiBase
      .route({ method: 'POST', path: '/api/inventory/items', successStatus: 201 })
      .input(inventoryItemSchema)
      .output(inventoryItemSchema)
      .errors(domainErrors(['INVENTORY_MOVEMENT_INVALID'])),
    warehouse: apiBase
      .route({ method: 'POST', path: '/api/inventory/warehouses', successStatus: 201 })
      .input(inventoryWarehouseSchema)
      .output(inventoryWarehouseSchema)
      .errors(domainErrors(['INVENTORY_MOVEMENT_INVALID'])),
  },
  movements: {
    store: apiBase
      .route({ method: 'POST', path: '/api/inventory/movements', successStatus: 201 })
      .input(inventoryMovementSchema)
      .output(inventoryMovementSchema)
      .errors(domainErrors(['INVENTORY_MOVEMENT_INVALID'])),
    showStock: apiBase
      .route({ method: 'GET', path: '/api/inventory/stock' })
      .input(v.strictObject({ companyId: idSchema, itemId: idSchema, warehouseId: idSchema }))
      .output(inventoryStockSchema)
      .errors(domainErrors(['INVENTORY_MOVEMENT_INVALID'])),
  },
}
