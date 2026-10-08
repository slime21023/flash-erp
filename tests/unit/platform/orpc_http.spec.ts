import 'reflect-metadata'
import { Module, type INestApplication } from '@nestjs/common'
import { APP_INTERCEPTOR, NestFactory, Reflector } from '@nestjs/core'
import { createORPCClient, ORPCError } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import { ORPCModule } from '@orpc/nest'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppController } from '../../../src/app.controller.js'
import { IdentityController } from '../../../src/modules/identity/controllers/identity.controller.js'
import { identityApiContract } from '../../../src/modules/identity/contracts/identity_api_contract.js'
import { IdentityContract } from '../../../src/modules/identity/contracts/identity_contract.js'
import { AccessDeniedError } from '../../../src/modules/identity/contracts/identity_errors.js'
import { SalesController } from '../../../src/modules/sales/controllers/sales.controller.js'
import { salesApiContract } from '../../../src/modules/sales/contracts/sales_api_contract.js'
import {
  SalesContract,
  type CustomerSnapshot,
  type SalesOrderSnapshot,
} from '../../../src/modules/sales/contracts/sales_contract.js'
import {
  CreditLimitExceededError,
  CustomerNotFoundError,
} from '../../../src/modules/sales/contracts/sales_errors.js'
import {
  currentEventMetadata,
  currentRequestScope,
} from '../../../src/platform/context/request_context.js'
import { RequestContextInterceptor } from '../../../src/platform/context/request_context.interceptor.js'
import { err, ok } from '../../../src/platform/fp/result.js'
import { configureHttpApp } from '../../../src/platform/http/configure_http_app.js'
import { createOpenApiDocument } from '../../../src/platform/http/openapi_document.js'
import {
  Authenticator,
  AuthGuard,
  Authorizer,
  CsrfGuard,
  RbacGuard,
  AuthenticationFailedError,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  type AuthenticatedPrincipal,
} from '../../../src/platform/security/index.js'

import { InvalidApprovalStateError } from '../../../src/platform/workflow/index.js'
import { ProcurementController } from '../../../src/modules/procurement/controllers/procurement.controller.js'
import { ProcurementContract } from '../../../src/modules/procurement/contracts/procurement_contract.js'
import { procurementApiContract } from '../../../src/modules/procurement/contracts/procurement_api_contract.js'
import { InMemoryProcurementService } from '../../../src/modules/procurement/services/in_memory_procurement_service.js'
const principal: AuthenticatedPrincipal = {
  id: 'user-1',
  username: 'manager',
  displayName: 'Manager',
  isActive: true,
  roles: ['MANAGER'],
  organizationUnitIds: ['company-1'],
}
let activePrincipal = principal
const procurement: ProcurementContract = new InMemoryProcurementService()
const getStoredPo = procurement.getPurchaseOrder.bind(procurement)
procurement.getPurchaseOrder = async (...args) =>
  args[0] === 'invalid-state' ? err(new InvalidApprovalStateError()) : getStoredPo(...args)
const expiresAt = new Date('2030-01-01T12:00:00.000Z')
const hugeAmount = 900719925474099312345678901234567890n
const trace: string[] = []
let deniedPermission: string | undefined
let observedContext:
  | {
      scope: ReturnType<typeof currentRequestScope>
      metadata: ReturnType<typeof currentEventMetadata>
    }
  | undefined

const identity: IdentityContract = {
  async login({ username, password }) {
    trace.push('login')
    return username === principal.username && password === 'correct-password'
      ? ok({ accessToken: 'session-token', expiresAt, user: principal })
      : err(new AuthenticationFailedError())
  },
  async authenticate(token) {
    trace.push('authenticate')
    return token === 'session-token' ? ok(activePrincipal) : err(new AuthenticationFailedError())
  },
  async logout() {
    trace.push('logout')
    return ok(undefined)
  },
  async registerLocalUser(input) {
    trace.push('register')
    return ok({
      id: input.id,
      username: input.username,
      displayName: input.displayName,
      isActive: true,
    })
  },
  async authorize(userId, permission, organizationUnitId) {
    trace.push(`authorize:${userId}:${permission}:${organizationUnitId}`)
    return deniedPermission === permission ? err(new AccessDeniedError(permission)) : ok(undefined)
  },
}

const customer: CustomerSnapshot = {
  id: 'customer-1',
  companyId: 'company-1',
  code: 'C001',
  name: 'Customer',
  currency: 'TWD',
  paymentTerms: 'NET30',
  creditLimitMinorUnits: hugeAmount,
  currentOutstandingMinorUnits: 0n,
  isActive: true,
}
const order: SalesOrderSnapshot = {
  id: 'order-1',
  companyId: 'company-1',
  customerId: customer.id,
  number: 'SO001',
  status: 'DRAFT',
  taxRateBasisPoints: 500,
  netAmountMinorUnits: 100n,
  taxAmountMinorUnits: 5n,
  totalAmountMinorUnits: 105n,
  reservationIds: [],
  lines: [
    {
      itemId: 'item-1',
      warehouseId: 'warehouse-1',
      orderedQuantity: 1n,
      shippedQuantity: 0n,
      unitPriceMinorUnits: 100n,
      lineTotalMinorUnits: 100n,
      currency: 'TWD',
    },
  ],
}
const creditDetails = {
  customerId: customer.id,
  creditLimitMinorUnits: 100n,
  currentOutstandingMinorUnits: 80n,
  pendingOrdersMinorUnits: 10n,
  requestedOrderAmountMinorUnits: 20n,
  excessMinorUnits: 10n,
}
const sales: Omit<SalesContract, 'settleCustomerReceivable'> = {
  async registerCustomer(input) {
    trace.push('registerCustomer')
    return ok({ ...input, currentOutstandingMinorUnits: 0n, isActive: true })
  },
  async getCustomer(id) {
    trace.push('getCustomer')
    await Promise.resolve()
    observedContext = { scope: currentRequestScope(), metadata: currentEventMetadata() }
    if (id === 'missing') return err(new CustomerNotFoundError(id))
    if (id === 'unexpected') throw new Error('private database password')
    if (id === 'invalid-output')
      return ok({ ...customer, currency: 'INVALID', name: 'private output value' })
    return ok(customer)
  },
  async checkCustomerCredit(customerId) {
    return ok({
      customerId,
      creditLimitMinorUnits: hugeAmount,
      currentOutstandingMinorUnits: 0n,
      pendingOrdersMinorUnits: 0n,
      totalExposureMinorUnits: 0n,
      isApproved: true,
      excessMinorUnits: 0n,
    })
  },
  async createSalesOrder(input) {
    trace.push('createSalesOrder')
    return ok({ ...order, id: input.id })
  },
  async getSalesOrder() {
    return ok(order)
  },
  async confirmSalesOrder() {
    return err(new CreditLimitExceededError(creditDetails))
  },
  async createShipment(input) {
    return ok({
      ...input,
      companyId: 'company-1',
      customerId: customer.id,
      status: 'SHIPPED',
      totalShippedAmountMinorUnits: 0n,
      lines: [],
      shippedAt: expiresAt,
    })
  },
}

// Vitest's esbuild transform does not emit Nest constructor metadata.
Reflect.defineMetadata('design:paramtypes', [IdentityContract], IdentityController)
Reflect.defineMetadata('design:paramtypes', [SalesContract], SalesController)
Reflect.defineMetadata('design:paramtypes', [ProcurementContract], ProcurementController)

@Module({
  imports: [ORPCModule.forRoot({})],
  controllers: [IdentityController, SalesController, ProcurementController, AppController],
  providers: [
    { provide: IdentityContract, useValue: identity },
    { provide: SalesContract, useValue: sales },
    { provide: ProcurementContract, useValue: procurement },
    { provide: Authenticator, useExisting: IdentityContract },
    { provide: Authorizer, useExisting: IdentityContract },
    {
      provide: AuthGuard,
      inject: [Reflector, Authenticator],
      useFactory: (reflector: Reflector, authenticator: Authenticator) =>
        new AuthGuard(reflector, authenticator),
    },
    {
      provide: CsrfGuard,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new CsrfGuard(reflector),
    },
    {
      provide: RbacGuard,
      inject: [Reflector, Authorizer],
      useFactory: (reflector: Reflector, authorizer: Authorizer) =>
        new RbacGuard(reflector, authorizer),
    },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
})
class HttpTestModule {}

const httpContract = {
  identity: identityApiContract,
  sales: salesApiContract,
  procurement: procurementApiContract,
}
const authenticatedHeaders = { authorization: 'Bearer session-token', 'x-org-unit-id': 'company-1' }
const userInput = {
  id: 'new-user',
  username: 'new-user',
  displayName: 'New user',
  password: 'valid-password-123',
}
const customerInput = {
  id: 'new-customer',
  companyId: 'company-1',
  code: 'C002',
  name: 'New customer',
  currency: 'TWD',
  creditLimitMinorUnits: hugeAmount.toString(),
}
const orderInput = {
  id: 'new-order',
  companyId: 'company-1',
  customerId: customer.id,
  number: 'SO002',
  lines: [
    {
      itemId: 'item-1',
      warehouseId: 'warehouse-1',
      orderedQuantity: '1',
      unitPriceMinorUnits: '100',
      currency: 'TWD',
    },
  ],
}
let app: INestApplication
let baseUrl: string

function clientFor(
  headers: Record<string, string> = authenticatedHeaders
): ContractRouterClient<typeof httpContract> {
  return createORPCClient(new OpenAPILink(httpContract, { url: baseUrl, headers }))
}

function post(path: string, body: unknown, headers: Record<string, string> = authenticatedHeaders) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('Nest oRPC HTTP boundary', () => {
  beforeAll(async () => {
    app = await NestFactory.create(HttpTestModule, { bodyParser: false, logger: false })
    configureHttpApp(app)
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  })
  afterAll(async () => {
    await app?.close()
  })
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    trace.length = 0
    deniedPermission = undefined
    observedContext = undefined
  })

  it('logs in publicly with a direct session object and separate session/CSRF cookies', async () => {
    const response = await post(
      '/api/identity/login',
      { username: 'manager', password: 'correct-password' },
      {}
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      accessToken: 'session-token',
      expiresAt: expiresAt.toISOString(),
      user: principal,
    })
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toContain(
      'HttpOnly'
    )
    expect(cookies.find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`))).not.toContain(
      'HttpOnly'
    )
    expect(
      cookies.every((cookie) => cookie.includes('SameSite=Lax') && cookie.includes('Path=/'))
    ).toBe(true)
    expect(trace).toEqual(['login'])
    await expect(
      clientFor({}).identity.login({ username: 'manager', password: 'wrong-password' })
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED', status: 401, defined: true })
  })

  it('returns the principal directly through a typed OpenAPI client and a session cookie', async () => {
    const result = await clientFor({
      cookie: `${SESSION_COOKIE_NAME}=session-token`,
    }).identity.session({})
    expect(result).toEqual(principal)
    expect(trace).toEqual(['authenticate'])
  })

  it('rejects cookie logout without CSRF, then returns an empty 204 and clears both cookies', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cookie = `${SESSION_COOKIE_NAME}=session-token; ${CSRF_COOKIE_NAME}=csrf-token`
    const rejected = await post('/api/identity/logout', {}, { cookie })
    expect(rejected.status).toBe(403)
    expect(await rejected.json()).toMatchObject({ code: 'FORBIDDEN', status: 403, defined: true })
    expect(trace).toEqual(['authenticate'])
    const response = await post(
      '/api/identity/logout',
      {},
      { cookie, 'x-csrf-token': 'csrf-token' }
    )
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies.every((value) => value.includes('Max-Age=0'))).toBe(true)
    expect(trace).toEqual(['authenticate', 'authenticate', 'logout'])
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('lets bearer authentication bypass CSRF even with a session cookie', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await clientFor({
      authorization: 'Bearer session-token',
      cookie: `${SESSION_COOKIE_NAME}=invalid-cookie-token`,
    }).identity.logout({})
    expect(result).toBeUndefined()
    expect(trace).toEqual(['authenticate', 'logout'])
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('runs authentication, CSRF and permission authorization in that order', async () => {
    const invalid = await post('/api/identity/users', userInput, {
      cookie: `${SESSION_COOKIE_NAME}=invalid`,
    })
    expect(invalid.status).toBe(401)
    expect(trace).toEqual(['authenticate'])
    trace.length = 0
    const cookie = `${SESSION_COOKIE_NAME}=session-token; ${CSRF_COOKIE_NAME}=csrf-token`
    const csrf = await post('/api/identity/users', userInput, {
      cookie,
      'x-org-unit-id': 'company-1',
    })
    expect(csrf.status).toBe(403)
    expect(trace).toEqual(['authenticate'])
    trace.length = 0
    deniedPermission = 'identity.user.create'
    const rbac = await post('/api/identity/users', userInput, {
      cookie,
      'x-csrf-token': 'csrf-token',
      'x-org-unit-id': 'company-1',
    })
    expect(rbac.status).toBe(403)
    expect(trace).toEqual(['authenticate', 'authorize:user-1:identity.user.create:company-1'])
    trace.length = 0
    deniedPermission = undefined
    const accepted = await post('/api/identity/users', userInput, {
      cookie,
      'x-csrf-token': 'csrf-token',
      'x-org-unit-id': 'company-1',
    })
    expect(accepted.status).toBe(201)
    expect(trace).toEqual([
      'authenticate',
      'authorize:user-1:identity.user.create:company-1',
      'register',
    ])
  })

  it('requires a valid organization scope before checking business permissions', async () => {
    for (const scope of [undefined, 'company 1']) {
      trace.length = 0
      const headers: Record<string, string> = { authorization: 'Bearer session-token' }
      if (scope) headers['x-org-unit-id'] = scope
      const response = await fetch(`${baseUrl}/api/sales/customers/customer-1`, { headers })
      expect(response.status).toBe(403)
      expect(trace).toEqual(['authenticate'])
    }
  })

  it('propagates actor, organization scope and request ID through an asynchronous contract call', async () => {
    const response = await fetch(`${baseUrl}/api/sales/customers/customer-1`, {
      headers: { ...authenticatedHeaders, 'x-request-id': 'http-integration:42' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe('http-integration:42')
    expect(observedContext).toEqual({
      scope: { organizationUnitId: 'company-1' },
      metadata: { actorId: 'user-1', requestId: 'http-integration:42' },
    })
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('returns registration 201 with exact integer strings beyond Number precision', async () => {
    const user = await post('/api/identity/users', userInput)
    expect(user.status).toBe(201)
    expect(await user.json()).toEqual({
      id: userInput.id,
      username: userInput.username,
      displayName: userInput.displayName,
      isActive: true,
    })
    const response = await post('/api/sales/customers', customerInput)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      creditLimitMinorUnits: hugeAmount.toString(),
      currentOutstandingMinorUnits: '0',
    })
    const result = await clientFor().sales.registerCustomer(customerInput)
    expect(result.creditLimitMinorUnits).toBe(hugeAmount.toString())
  })

  it.each([
    ['/api/identity/users', { ...userInput, passwordHash: 'prehashed-secret' }],
    ['/api/identity/users', { ...userInput, password: 'short' }],
    ['/api/sales/customers', { ...customerInput, surprise: true }],
    ['/api/sales/customers', { ...customerInput, creditLimitMinorUnits: '1.5' }],
    ['/api/sales/orders', { ...orderInput, lines: [{ ...orderInput.lines[0], surprise: true }] }],
    [
      '/api/sales/orders',
      { ...orderInput, lines: [{ ...orderInput.lines[0], orderedQuantity: '-1' }] },
    ],
    [
      '/api/sales/shipments',
      {
        id: 'shipment-1',
        salesOrderId: 'order-1',
        warehouseId: 'warehouse-1',
        shipmentDate: '2025-02-29',
      },
    ],
  ])('rejects invalid or unknown input before invoking a use case: %s', async (path, input) => {
    const response = await post(path, input)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'BAD_REQUEST', status: 400 })
    expect(
      trace.some((entry) => ['register', 'registerCustomer', 'createSalesOrder'].includes(entry))
    ).toBe(false)
  })

  it.each(['additionalAmount=1.5', 'additionalAmount=-1', 'additionalAmount=1&unknown=value'])(
    'rejects invalid or unknown query values: %s',
    async (query) => {
      const response = await fetch(
        `${baseUrl}/api/sales/customers/customer-1/credit-check?${query}`,
        { headers: authenticatedHeaders }
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'BAD_REQUEST', status: 400 })
    }
  )

  it('preserves declared domain codes, statuses and structured data for raw and typed clients', async () => {
    const missing = await fetch(`${baseUrl}/api/sales/customers/missing`, {
      headers: authenticatedHeaders,
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
      status: 404,
      defined: true,
    })
    const credit = await post('/api/sales/orders/order-1/confirm', {})
    expect(credit.status).toBe(422)
    expect(await credit.json()).toMatchObject({
      code: 'CREDIT_LIMIT_EXCEEDED',
      status: 422,
      defined: true,
      data: { creditLimitMinorUnits: '100', excessMinorUnits: '10' },
    })
    try {
      await clientFor().sales.confirmOrder({ id: 'order-1' })
      expect.fail('Expected a declared credit limit error')
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect(error).toMatchObject({
        code: 'CREDIT_LIMIT_EXCEEDED',
        status: 422,
        defined: true,
        data: { customerId: customer.id, requestedOrderAmountMinorUnits: '20' },
      })
    }
  })

  it.each(['unexpected', 'invalid-output'])(
    'sanitizes unexpected and output-validation failures: %s',
    async (id) => {
      const response = await fetch(`${baseUrl}/api/sales/customers/${id}`, {
        headers: authenticatedHeaders,
      })
      expect(response.status).toBe(500)
      const payload = await response.json()
      expect(payload).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', status: 500 })
      expect(payload).not.toHaveProperty('data')
      expect(JSON.stringify(payload)).not.toContain('private')
      expect(payload).not.toHaveProperty('stack')
    }
  )

  it('rejects malformed JSON, oversized bodies and unsupported media with canonical errors', async () => {
    for (const [body, contentType, status, code] of [
      ['{"username":', 'application/json', 400, 'BAD_REQUEST'],
      [
        JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
        'application/json',
        413,
        'PAYLOAD_TOO_LARGE',
      ],
      ['username=manager', 'application/x-www-form-urlencoded', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ] as const) {
      const response = await fetch(`${baseUrl}/api/identity/login`, {
        method: 'POST',
        headers: { 'content-type': contentType, origin: 'http://localhost:5173' },
        body,
      })
      expect(response.status).toBe(status)
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
      expect(response.headers.get('access-control-allow-credentials')).toBe('true')
      expect(await response.json()).toMatchObject({ code, status })
    }
    expect(trace).toEqual([])
  })

  it('keeps operational endpoints public and maps unknown routes and readiness failures', async () => {
    for (const path of ['/', '/health']) {
      const response = await fetch(`${baseUrl}${path}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ service: 'flash-erp', status: 'ok' })
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const ready = await fetch(`${baseUrl}/ready`)
      expect(ready.status).toBe(503)
      expect(await ready.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 })
    } finally {
      consoleError.mockRestore()
    }
    const missing = await fetch(`${baseUrl}/not-a-route`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(trace).toEqual([])
  })

  it('enforces PO read scope, trusted stage roles and expected steps over HTTP', async () => {
    const supplier = await post('/api/procurement/suppliers', {
      id: 'http-po-supplier',
      companyId: 'company-1',
      code: 'HTTP-PO',
      name: 'Supplier',
    })
    expect(supplier.status).toBe(201)
    const created = await post('/api/procurement/purchase-orders', {
      id: 'http-po',
      companyId: 'company-1',
      supplierId: 'http-po-supplier',
      number: 'HTTP-PO',
      lines: [
        { itemId: 'item', orderedQuantity: '1', unitCostMinorUnits: '100000', currency: 'TWD' },
      ],
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      approval: { currentStepId: 'mgr-review', requiredRole: 'MANAGER', history: [] },
    })
    const path = '/api/procurement/purchase-orders/http-po'
    const invalid = await fetch(`${baseUrl}${path}`, {
      headers: { ...authenticatedHeaders, authorization: 'Bearer invalid' },
    })
    expect(invalid.status).toBe(401)
    deniedPermission = 'procurement.order.read'
    const deniedRead = await fetch(`${baseUrl}${path}`, { headers: authenticatedHeaders })
    expect(deniedRead.status).toBe(403)
    deniedPermission = undefined
    const crossScope = await fetch(`${baseUrl}${path}`, {
      headers: { ...authenticatedHeaders, 'x-org-unit-id': 'other-company' },
    })
    expect(crossScope.status).toBe(403)
    activePrincipal = { ...principal, roles: ['ADMIN'] }
    const admin = await post(`${path}/approve`, { expectedStepId: 'mgr-review' })
    expect(admin.status).toBe(403)
    expect(await admin.json()).toMatchObject({
      code: 'UNAUTHORIZED_APPROVER',
      status: 403,
      defined: true,
    })
    activePrincipal = { ...principal, roles: ['ADMIN', 'MANAGER'] }
    expect((await post(`${path}/approve`, {})).status).toBe(400)
    expect(
      (
        await post(`${path}/approve`, {
          expectedStepId: 'mgr-review',
          roles: ['DIRECTOR'],
          actorId: 'forged',
        })
      ).status
    ).toBe(400)
    expect((await post(`${path}/approve`, { expectedStepId: 'director-review' })).status).toBe(409)
    const manager = await post(`${path}/approve`, {
      expectedStepId: 'mgr-review',
      comment: 'Checked',
    })
    expect(manager.status).toBe(200)
    const pending = await manager.json()
    expect(pending).toMatchObject({
      status: 'DRAFT',
      approval: {
        currentStepId: 'director-review',
        requiredRole: 'DIRECTOR',
        history: [{ approverId: principal.id, comment: 'Checked' }],
      },
    })
    expect((await post(`${path}/approve`, { expectedStepId: 'mgr-review' })).status).toBe(409)
    activePrincipal = { ...principal, id: 'http-director', roles: ['DIRECTOR'] }
    const loaded = await clientFor().procurement.getPO({ id: 'http-po' })
    expect(loaded).toEqual(pending)
    const completed = await clientFor().procurement.approvePO({
      id: 'http-po',
      expectedStepId: loaded.approval!.currentStepId!,
    })
    expect(completed.status).toBe('APPROVED')
    expect(completed.approval?.history.map((record) => record.approverId)).toEqual([
      principal.id,
      'http-director',
    ])
  })

  it('returns a generic error for invalid stored PO approval state', async () => {
    const response = await fetch(`${baseUrl}/api/procurement/purchase-orders/invalid-state`, {
      headers: authenticatedHeaders,
    })
    expect(response.status).toBe(500)
    const payload = await response.json()
    expect(payload).toMatchObject({
      code: 'INVALID_APPROVAL_STATE',
      status: 500,
      message: 'Stored approval state is invalid',
    })
    expect(payload).not.toHaveProperty('data')
    expect(payload).not.toHaveProperty('stack')
    expect(payload).not.toHaveProperty('history')
  })

  it('generates OpenAPI paths and success statuses from the same browser-safe contracts', async () => {
    const document = await createOpenApiDocument()
    expect(document.paths?.['/api/identity/login']?.post).toBeDefined()
    expect(document.paths?.['/api/identity/logout']?.post?.responses?.['204']).toBeDefined()
    expect(document.paths?.['/api/sales/customers']?.post?.responses?.['201']).toBeDefined()
    expect(
      document.paths?.['/api/sales/orders/{id}/confirm']?.post?.responses?.['422']
    ).toBeDefined()
    expect(document.components?.securitySchemes).toMatchObject({
      bearerAuth: { type: 'http', scheme: 'bearer' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE_NAME },
    })
  })
})
