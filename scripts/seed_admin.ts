import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { InitialSchema1710000000000 } from '../src/database/migrations/1710000000000_initial_schema.js'
import { FixCamelCaseColumns1710000001000 } from '../src/database/migrations/1710000001000_fix_camel_case_columns.js'
import { HardenSchemaDefaults1710000002000 } from '../src/database/migrations/1710000002000_harden_schema_defaults.js'
import { ProductionHardening1710000003000 } from '../src/database/migrations/1710000003000_production_hardening.js'
import { hashPassword } from '../src/modules/identity/services/password.js'
import { LocalUserEntity } from '../src/modules/identity/entities/local_user.entity.js'
import { RoleEntity } from '../src/modules/identity/entities/role.entity.js'
import { PermissionEntity } from '../src/modules/identity/entities/permission.entity.js'
import { RolePermissionEntity } from '../src/modules/identity/entities/role_permission.entity.js'
import { UserRoleEntity } from '../src/modules/identity/entities/user_role.entity.js'
import { UserOrganizationScopeEntity } from '../src/modules/identity/entities/user_organization_scope.entity.js'
import { OrganizationUnitEntity } from '../src/modules/organization/entities/organization_unit.entity.js'

async function seedAdmin() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5433),
    username: process.env.DB_USER ?? 'flash_erp',
    password: process.env.DB_PASSWORD ?? 'flash_erp',
    database: process.env.DB_DATABASE ?? 'flash_erp',
    entities: [
      LocalUserEntity,
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      UserRoleEntity,
      UserOrganizationScopeEntity,
      OrganizationUnitEntity,
    ],
    migrations: [
      InitialSchema1710000000000,
      FixCamelCaseColumns1710000001000,
      HardenSchemaDefaults1710000002000,
      ProductionHardening1710000003000,
    ],
    migrationsRun: true,
    synchronize: false,
  })

  await dataSource.initialize()
  console.log('Connected to PostgreSQL for system initialization.')

  const orgRepo = dataSource.getRepository(OrganizationUnitEntity)
  let rootOrg = await orgRepo.findOneBy({ id: 'org-root' })
  if (!rootOrg) {
    rootOrg = orgRepo.create({
      id: 'org-root',
      code: 'HQ',
      name: 'FlashERP Enterprise Headquarters',
      kind: 'COMPANY',
      parentId: null,
    })
    await orgRepo.save(rootOrg)
    console.log('Created root organization unit: org-root')
  }

  const roleRepo = dataSource.getRepository(RoleEntity)
  const permRepo = dataSource.getRepository(PermissionEntity)
  const rolePermRepo = dataSource.getRepository(RolePermissionEntity)

  let adminRole = await roleRepo.findOneBy({ id: 'role-admin' })
  if (!adminRole) {
    adminRole = roleRepo.create({
      id: 'role-admin',
      code: 'ADMIN',
      name: 'System Administrator',
    })
    await roleRepo.save(adminRole)
  } else if (adminRole.code !== 'ADMIN') {
    adminRole.code = 'ADMIN'
    await roleRepo.save(adminRole)
  }

  const permissions = [
    'organization.unit.create',
    'organization.unit.read',
    'identity.user.create',
    'finance.account.create',
    'finance.account.read',
    'finance.period.create',
    'finance.period.lock',
    'finance.settings.configure',
    'finance.journal.create',
    'finance.voucher.post',
    'finance.journal.reverse',
    'finance.report.read',
    'inventory.master.write',
    'inventory.stock.read',
    'inventory.movement.record',
    'procurement.supplier.create',
    'procurement.order.create',
    'procurement.order.approve',
    'procurement.goods.receive',
    'procurement.requisition.create',
    'procurement.requisition.submit',
    'procurement.requisition.approve',
    'procurement.requisition.convert',
    'procurement.invoice.create',
    'procurement.invoice.match',
    'procurement.invoice.voucher',
    'sales.customer.create',
    'sales.customer.read',
    'sales.order.create',
    'sales.order.read',
    'sales.order.approve',
    'sales.shipment.create',
    'treasury.account.create',
    'treasury.account.read',
    'treasury.payment.create',
    'treasury.payment.read',
    'treasury.payment.post',
    'treasury.receipt.create',
    'treasury.receipt.read',
    'treasury.receipt.post',
    'treasury.statement.import',
    'treasury.statement.reconcile',
    'manufacturing.bom.create',
    'manufacturing.bom.read',
    'manufacturing.order.create',
    'manufacturing.order.read',
    'manufacturing.order.release',
    'manufacturing.order.issue',
    'manufacturing.order.complete',
    'manufacturing.overhead.allocate',
  ]

  for (const code of permissions) {
    let perm = await permRepo.findOneBy({ code })
    if (!perm) {
      perm = permRepo.create({ code, description: code })
      await permRepo.save(perm)
    }
    const rolePerm = await rolePermRepo.findOneBy({
      roleId: 'role-admin',
      permissionCode: code,
    })
    if (!rolePerm) {
      await rolePermRepo.save(
        rolePermRepo.create({
          roleId: 'role-admin',
          permissionCode: code,
        })
      )
    }
  }

  const userRepo = dataSource.getRepository(LocalUserEntity)
  const userRoleRepo = dataSource.getRepository(UserRoleEntity)
  const userScopeRepo = dataSource.getRepository(UserOrganizationScopeEntity)

  let adminUser = await userRepo.findOneBy({ username: 'admin' })
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminPassword !== undefined && adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters')
  }
  if (!adminUser) {
    if (!adminPassword) throw new Error('ADMIN_PASSWORD is required when creating the admin user')
    const passwordHash = await hashPassword(adminPassword)
    adminUser = userRepo.create({
      id: 'user-admin',
      username: 'admin',
      displayName: 'System Administrator',
      passwordHash,
      isActive: true,
    })
    await userRepo.save(adminUser)
    console.log('Created superadmin user: admin')
  } else if (adminPassword) {
    adminUser.passwordHash = await hashPassword(adminPassword)
    await userRepo.save(adminUser)
  }

  const userRole = await userRoleRepo.findOneBy({
    userId: adminUser.id,
    roleId: 'role-admin',
  })
  if (!userRole) {
    await userRoleRepo.save(
      userRoleRepo.create({
        userId: adminUser.id,
        roleId: 'role-admin',
      })
    )
  }

  const userScope = await userScopeRepo.findOneBy({
    userId: adminUser.id,
    organizationUnitId: 'org-root',
  })
  if (!userScope) {
    await userScopeRepo.save(
      userScopeRepo.create({
        userId: adminUser.id,
        organizationUnitId: 'org-root',
      })
    )
  }

  console.log('Clean system bootstrap complete! Initial admin user ready.')
  await dataSource.destroy()
}

seedAdmin().catch((err) => {
  console.error('System seed failed:', err)
  process.exit(1)
})
