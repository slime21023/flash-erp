import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InventoryModule } from '@modules/inventory/inventory.module.js'
import { FinanceModule } from '@modules/finance/finance.module.js'
import { ManufacturingContract } from './contracts/index.js'
import { BomEntity } from './entities/bom.entity.js'
import { BomLineEntity } from './entities/bom_line.entity.js'
import { WorkOrderEntity } from './entities/work_order.entity.js'
import { WorkOrderLineEntity } from './entities/work_order_line.entity.js'
import { TypeOrmManufacturingService } from './services/typeorm_manufacturing_service.js'
import { ManufacturingController } from './controllers/manufacturing.controller.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([BomEntity, BomLineEntity, WorkOrderEntity, WorkOrderLineEntity]),
    InventoryModule,
    FinanceModule,
  ],
  controllers: [ManufacturingController],
  providers: [
    {
      provide: ManufacturingContract,
      useClass: TypeOrmManufacturingService,
    },
  ],
  exports: [ManufacturingContract],
})
export class ManufacturingModule {}
