import router from '@adonisjs/core/services/router'

const OrganizationUnitsController = () =>
  import('#modules/organization/controllers/organization_units_controller')

router.post('/organization/units', [OrganizationUnitsController, 'store'])
router.get('/organization/units/:id', [OrganizationUnitsController, 'show'])
