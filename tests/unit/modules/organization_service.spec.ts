import assert from 'node:assert/strict'
import { test } from '@japa/runner'
import { InMemoryOrganizationService } from '#modules/organization/services/in_memory_organization_service'

test('organization service registers and resolves an organization unit', async () => {
  const service = new InMemoryOrganizationService()
  const created = await service.register({
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
  const result = await service.register({
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
