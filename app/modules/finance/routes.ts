import router from '@adonisjs/core/services/router'

const AccountsController = () => import('#modules/finance/controllers/accounts_controller')

router.post('/finance/accounts', [AccountsController, 'store'])
router.get('/finance/accounts/:id', [AccountsController, 'show'])
