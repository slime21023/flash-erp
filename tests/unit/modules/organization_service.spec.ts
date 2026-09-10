import assert from 'node:assert/strict'
import { test } from 'vitest'
import { InMemoryOrganizationService } from '@modules/organization/services/in_memory_organization_service.js'

test('organization service registers and resolves an organization unit', async () => {
  const service = new InMemoryOrganizationService()
  const created = await service.registerUnit({
    id: 'company-001',
    code: ' acme ',
    name: 'Acme Corporation',
    kind: 'COMPANY',
  })

  assert.equal(created.isOk, true)
  if (created.isOk) {
    assert.equal(created.value.code, 'ACME')
    assert.equal(created.value.parentId, null)
  }

  const found = await service.findUnit('company-001')
  assert.equal(found.isOk, true)
})

test('organization service returns a Result error for a missing parent', async () => {
  const service = new InMemoryOrganizationService()
  const result = await service.registerUnit({
    id: 'plant-001',
    code: 'plant-001',
    name: 'Main Plant',
    kind: 'PLANT',
    parentId: 'company-missing',
  })

  assert.equal(result.isErr, true)
  if (result.isErr) {
    assert.equal(result.error.code, 'ORGANIZATION_UNIT_NOT_FOUND')
  }
})

test('organization service enforces hierarchy and unique codes', async () => {
  const service = new InMemoryOrganizationService()
  const company = await service.registerUnit({
    id: 'company-001',
    code: 'ACME',
    name: 'Acme Corporation',
    kind: 'COMPANY',
  })
  assert.equal(company.isOk, true)

  const invalidWarehouse = await service.registerUnit({
    id: 'warehouse-001',
    code: 'WH-001',
    name: 'Warehouse',
    kind: 'WAREHOUSE',
    parentId: 'company-001',
  })
  assert.equal(invalidWarehouse.isErr, true)
  if (invalidWarehouse.isErr) {
    assert.equal(invalidWarehouse.error.code, 'INVALID_ORGANIZATION_UNIT')
  }

  const duplicateCode = await service.registerUnit({
    id: 'company-002',
    code: 'acme',
    name: 'Duplicate',
    kind: 'COMPANY',
  })
  assert.equal(duplicateCode.isErr, true)
  if (duplicateCode.isErr) {
    assert.equal(duplicateCode.error.code, 'ORGANIZATION_UNIT_ALREADY_EXISTS')
  }
})
