import { describe, expect, it } from 'vitest'
import {
  AddonRegistry,
  CircularModuleDependencyError,
  CustomFieldsEngine,
  LifecycleHooksEngine,
  MissingModuleDependencyError,
} from '@platform/addons/index.js'
import { DomainError } from '@platform/fp/domain_error.js'
import { err, ok } from '@platform/fp/result.js'
import { organizationManifest } from '@modules/organization/manifest.js'
import { identityManifest } from '@modules/identity/manifest.js'
import { auditManifest } from '@modules/audit/manifest.js'
import { financeManifest } from '@modules/finance/manifest.js'
import { inventoryManifest } from '@modules/inventory/manifest.js'
import { procurementManifest } from '@modules/procurement/manifest.js'
import { salesManifest } from '@modules/sales/manifest.js'
import { treasuryManifest } from '@modules/treasury/manifest.js'
import { manufacturingManifest } from '@modules/manufacturing/manifest.js'

describe('AddonRegistry & Dependency Resolution', () => {
  it('should resolve core 9 modules in topological dependency order without cycles', () => {
    const registry = new AddonRegistry()
    registry.register(organizationManifest)
    registry.register(identityManifest)
    registry.register(auditManifest)
    registry.register(financeManifest)
    registry.register(inventoryManifest)
    registry.register(procurementManifest)
    registry.register(salesManifest)
    registry.register(treasuryManifest)
    registry.register(manufacturingManifest)

    const res = registry.resolveDependencies()
    expect(res.isOk).toBe(true)

    if (res.isOk) {
      const orderedIds = res.value.map((m) => m.id)
      expect(orderedIds.length).toBe(9)

      // organization must precede identity, finance, inventory
      expect(orderedIds.indexOf('organization')).toBeLessThan(orderedIds.indexOf('identity'))
      expect(orderedIds.indexOf('organization')).toBeLessThan(orderedIds.indexOf('finance'))
      expect(orderedIds.indexOf('organization')).toBeLessThan(orderedIds.indexOf('inventory'))

      // inventory and finance must precede procurement, sales, manufacturing
      expect(orderedIds.indexOf('inventory')).toBeLessThan(orderedIds.indexOf('procurement'))
      expect(orderedIds.indexOf('finance')).toBeLessThan(orderedIds.indexOf('procurement'))
      expect(orderedIds.indexOf('inventory')).toBeLessThan(orderedIds.indexOf('sales'))
      expect(orderedIds.indexOf('finance')).toBeLessThan(orderedIds.indexOf('sales'))
      expect(orderedIds.indexOf('inventory')).toBeLessThan(orderedIds.indexOf('manufacturing'))
      expect(orderedIds.indexOf('finance')).toBeLessThan(orderedIds.indexOf('manufacturing'))

      // identity must precede audit
      expect(orderedIds.indexOf('identity')).toBeLessThan(orderedIds.indexOf('audit'))
    }
  })

  it('should return MissingModuleDependencyError when a module depends on an unregistered module', () => {
    const registry = new AddonRegistry()
    registry.register({
      id: 'plugin-a',
      name: 'Plugin A',
      version: '1.0.0',
      summary: 'Test',
      category: 'Operations',
      author: 'Tester',
      dependsOn: ['non-existent-dep'],
      installable: true,
      autoInstall: false,
    })

    const res = registry.resolveDependencies()
    expect(res.isErr).toBe(true)
    if (res.isErr) {
      expect(res.error).toBeInstanceOf(MissingModuleDependencyError)
      expect(res.error.code).toBe('MISSING_MODULE_DEPENDENCY')
    }
  })

  it('should return CircularModuleDependencyError when circular dependencies exist', () => {
    const registry = new AddonRegistry()
    registry.register({
      id: 'mod-a',
      name: 'Module A',
      version: '1.0.0',
      summary: 'Test',
      category: 'Operations',
      author: 'Tester',
      dependsOn: ['mod-b'],
      installable: true,
      autoInstall: false,
    })
    registry.register({
      id: 'mod-b',
      name: 'Module B',
      version: '1.0.0',
      summary: 'Test',
      category: 'Operations',
      author: 'Tester',
      dependsOn: ['mod-a'],
      installable: true,
      autoInstall: false,
    })

    const res = registry.resolveDependencies()
    expect(res.isErr).toBe(true)
    if (res.isErr) {
      expect(res.error).toBeInstanceOf(CircularModuleDependencyError)
      expect(res.error.code).toBe('CIRCULAR_MODULE_DEPENDENCY')
    }
  })
})

describe('CustomFieldsEngine', () => {
  it('should validate and accept valid custom fields for an entity', () => {
    const engine = new CustomFieldsEngine()
    engine.registerFields('Customer', [
      { name: 'taxId', label: '統一編號', type: 'string', required: true },
      { name: 'rating', label: '客戶評級', type: 'number', allowedValues: [1, 2, 3, 4, 5] },
      { name: 'vip', label: 'VIP 客戶', type: 'boolean' },
    ])

    const res = engine.validate('Customer', {
      taxId: '12345678',
      rating: 5,
      vip: true,
    })

    expect(res.isOk).toBe(true)
    if (res.isOk) {
      expect(res.value.taxId).toBe('12345678')
      expect(res.value.rating).toBe(5)
      expect(res.value.vip).toBe(true)
    }
  })

  it('should reject invalid custom fields', () => {
    const engine = new CustomFieldsEngine()
    engine.registerFields('Customer', [
      { name: 'taxId', label: '統一編號', type: 'string', required: true },
      { name: 'rating', label: '客戶評級', type: 'number', allowedValues: [1, 2, 3] },
    ])

    // Missing required field
    const res1 = engine.validate('Customer', { rating: 2 })
    expect(res1.isErr).toBe(true)
    if (res1.isErr) {
      expect(res1.error.fieldName).toBe('taxId')
    }

    // Value outside allowedValues
    const res2 = engine.validate('Customer', { taxId: '12345678', rating: 99 })
    expect(res2.isErr).toBe(true)
    if (res2.isErr) {
      expect(res2.error.fieldName).toBe('rating')
    }
  })
})

describe('LifecycleHooksEngine', () => {
  class SampleHookError extends DomainError {
    readonly code = 'SAMPLE_HOOK_ERROR'

    constructor() {
      super('Hook interrupted processing')
    }
  }

  it('should execute hooks in order and allow interruption with error', async () => {
    const hooks = new LifecycleHooksEngine()
    const callStack: string[] = []

    hooks.register('salesOrder.beforeConfirm', async (ctx: { id: string }) => {
      callStack.push(`hook-1:${ctx.id}`)
      return ok(undefined)
    })

    hooks.register('salesOrder.beforeConfirm', async (ctx: { id: string }) => {
      callStack.push(`hook-2:${ctx.id}`)
      return err(new SampleHookError())
    })

    hooks.register('salesOrder.beforeConfirm', async (ctx: { id: string }) => {
      callStack.push(`hook-3:${ctx.id}`)
      return ok(undefined)
    })

    const res = await hooks.execute('salesOrder.beforeConfirm', { id: 'so-100' })
    expect(res.isErr).toBe(true)
    expect(callStack).toEqual(['hook-1:so-100', 'hook-2:so-100'])
  })

  it('should safely catch unhandled exceptions thrown by third-party plugins and return PluginExecutionError', async () => {
    const hooks = new LifecycleHooksEngine()

    hooks.register('inventory.beforeMovement', async () => {
      throw new Error('Unexpected third-party plugin crash')
    })

    const res = await hooks.execute('inventory.beforeMovement', {})
    expect(res.isErr).toBe(true)
    if (res.isErr) {
      expect(res.error.code).toBe('PLUGIN_EXECUTION_ERROR')
      expect(res.error.message).toContain('Unexpected third-party plugin crash')
    }
  })
})
