import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InventoryModule } from '@modules/inventory/inventory.module.js'
import { FinanceModule } from '@modules/finance/finance.module.js'
import { SalesContract } from './contracts/index.js'
import { CustomerEntity } from './entities/customer.entity.js'
import { SalesOrderEntity } from './entities/sales_order.entity.js'
import { SalesOrderLineEntity } from './entities/sales_order_line.entity.js'
import { ShipmentEntity } from './entities/shipment.entity.js'
import { ShipmentLineEntity } from './entities/shipment_line.entity.js'
import { TypeOrmSalesService } from './services/typeorm_sales_service.js'
import { SalesController } from './controllers/sales.controller.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerEntity,
      SalesOrderEntity,
      SalesOrderLineEntity,
      ShipmentEntity,
      ShipmentLineEntity,
    ]),
    InventoryModule,
    FinanceModule,
  ],
  controllers: [SalesController],
  providers: [
    {
      provide: SalesContract,
      useClass: TypeOrmSalesService,
    },
  ],
  exports: [SalesContract],
})
export class SalesModule {}
