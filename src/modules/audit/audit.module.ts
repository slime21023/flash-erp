import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuditContract } from './contracts/index.js'
import { AuditEntryEntity } from './entities/audit_entry.entity.js'
import { TypeOrmAuditService } from './services/typeorm_audit_service.js'

import { ProcurementAuditListener } from './listeners/procurement_audit_listener.js'
import { SalesAuditListener } from './listeners/sales_audit_listener.js'
import { TreasuryAuditListener } from './listeners/treasury_audit_listener.js'
import { ManufacturingAuditListener } from './listeners/manufacturing_audit_listener.js'

@Module({
  imports: [TypeOrmModule.forFeature([AuditEntryEntity])],
  providers: [
    {
      provide: AuditContract,
      useClass: TypeOrmAuditService,
    },
    ProcurementAuditListener,
    SalesAuditListener,
    TreasuryAuditListener,
    ManufacturingAuditListener,
  ],
  exports: [AuditContract],
})
export class AuditModule {}
