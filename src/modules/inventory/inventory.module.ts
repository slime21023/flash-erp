import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InventoryContract } from './contracts/index.js'
import { InventoryUnitEntity } from './entities/inventory_unit.entity.js'
import { InventoryItemEntity } from './entities/inventory_item.entity.js'
import { InventoryWarehouseEntity } from './entities/inventory_warehouse.entity.js'
import { InventoryMovementEntity } from './entities/inventory_movement.entity.js'
import { StockReservationEntity } from './entities/stock_reservation.entity.js'
import { TypeOrmInventoryService } from './services/typeorm_inventory_service.js'
import { InventoryMasterController } from './controllers/inventory_master.controller.js'
import { InventoryMovementsController } from './controllers/inventory_movements.controller.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryUnitEntity,
      InventoryItemEntity,
      InventoryWarehouseEntity,
      InventoryMovementEntity,
      StockReservationEntity,
    ]),
  ],
  controllers: [InventoryMasterController, InventoryMovementsController],
  providers: [
    {
      provide: InventoryContract,
      useClass: TypeOrmInventoryService,
    },
  ],
  exports: [InventoryContract],
})
export class InventoryModule {}
