import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createOpenApiDocument } from '@platform/http/openapi_document.js'

test('OpenAPI describes complete contracts, strict inputs, statuses and security', async () => {
  const document = await createOpenApiDocument()
  const operations = Object.values(document.paths ?? {}).flatMap((path) =>
    Object.entries(path ?? {}).filter(([method]) =>
      ['get', 'post', 'put', 'patch', 'delete'].includes(method)
    )
  )
  assert.equal(operations.length, 60)
  assert.ok(Object.keys(document.paths ?? {}).every((path) => path.startsWith('/api/')))
  assert.deepEqual(document.paths?.['/api/identity/login']?.post?.security, [])
  assert.ok(document.paths?.['/api/identity/login']?.post?.requestBody)
  assert.ok(document.paths?.['/api/identity/login']?.post?.responses?.['200'])
  assert.ok(document.paths?.['/api/sales/customers']?.post?.responses?.['201'])
  assert.ok(document.paths?.['/api/identity/logout']?.post?.responses?.['204'])
  assert.deepEqual(document.security, [{ bearerAuth: [] }, { cookieAuth: [] }])
  const reversal = document.paths?.['/api/finance/journal-entries/{entryId}/reverse']?.post
  assert.ok(
    reversal?.parameters?.some(
      (parameter) => 'name' in parameter && parameter.name === 'entryId' && parameter.in === 'path'
    )
  )
  const body = JSON.stringify(reversal?.requestBody)
  assert.ok(body.includes('"id"'))
  assert.ok(body.includes('"additionalProperties":false'))
  const shipment = JSON.stringify(
    document.paths?.['/api/sales/shipments']?.post?.responses?.['201']
  )
  for (const field of [
    'companyId',
    'customerId',
    'lines',
    'shippedAt',
    'totalShippedAmountMinorUnits',
  ])
    assert.ok(shipment.includes(`"${field}"`))
})
