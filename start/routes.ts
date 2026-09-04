import router from '@adonisjs/core/services/router'

router.get('/', async () => ({
  service: 'flash-erp',
  status: 'ok',
}))
