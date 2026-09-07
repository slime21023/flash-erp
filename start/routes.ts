import router from '@adonisjs/core/services/router'

await import('#modules/organization/routes')
await import('#modules/finance/routes')

router.get('/', async () => ({
  service: 'flash-erp',
  status: 'ok',
}))
