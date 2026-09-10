import { Module } from '@nestjs/common'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OrganizationModule } from '@modules/organization/organization.module.js'
import { AuditModule } from '@modules/audit/audit.module.js'
import { IdentityModule } from '@modules/identity/identity.module.js'
import { FinanceModule } from '@modules/finance/finance.module.js'
import { InventoryModule } from '@modules/inventory/inventory.module.js'
import { ProcurementModule } from '@modules/procurement/procurement.module.js'
import { SalesModule } from '@modules/sales/sales.module.js'
import { TreasuryModule } from '@modules/treasury/treasury.module.js'
import { ManufacturingModule } from '@modules/manufacturing/manufacturing.module.js'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { AddonsModule } from '@platform/addons/addons.module.js'
import { OutboxModule } from '@platform/persistence/outbox.module.js'
import { AppController } from './app.controller.js'
import { organizationManifest } from '@modules/organization/manifest.js'
import { identityManifest } from '@modules/identity/manifest.js'
import { auditManifest } from '@modules/audit/manifest.js'
import { financeManifest } from '@modules/finance/manifest.js'
import { inventoryManifest } from '@modules/inventory/manifest.js'
import { procurementManifest } from '@modules/procurement/manifest.js'
import { salesManifest } from '@modules/sales/manifest.js'
import { treasuryManifest } from '@modules/treasury/manifest.js'
import { manufacturingManifest } from '@modules/manufacturing/manifest.js'

const appDirectory = dirname(fileURLToPath(import.meta.url))

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    OutboxModule,
    AddonsModule.forRoot([
      organizationManifest,
      identityManifest,
      auditManifest,
      financeManifest,
      inventoryManifest,
      procurementManifest,
      salesManifest,
      treasuryManifest,
      manufacturingManifest,
    ]),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 5433),
        username: process.env.DB_USER ?? 'flash_erp',
        password: process.env.DB_PASSWORD ?? 'flash_erp',
        database: process.env.DB_DATABASE ?? 'flash_erp',
        autoLoadEntities: true,
        synchronize: false,
        migrations: [join(appDirectory, 'database/migrations/*.{js,ts}')],
        migrationsRun: true,
        migrationsTransactionMode: 'all',
      }),
    }),
    OrganizationModule,
    AuditModule,
    IdentityModule,
    FinanceModule,
    InventoryModule,
    ProcurementModule,
    SalesModule,
    TreasuryModule,
    ManufacturingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
