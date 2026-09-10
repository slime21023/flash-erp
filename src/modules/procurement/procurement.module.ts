import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InventoryModule } from '@modules/inventory/inventory.module.js'
import { FinanceModule } from '@modules/finance/finance.module.js'
import { ProcurementContract } from './contracts/index.js'
import { SupplierEntity } from './entities/supplier.entity.js'
import { PurchaseOrderEntity } from './entities/purchase_order.entity.js'
import { PurchaseOrderLineEntity } from './entities/purchase_order_line.entity.js'
import { GoodsReceiptEntity } from './entities/goods_receipt.entity.js'
import { GoodsReceiptLineEntity } from './entities/goods_receipt_line.entity.js'
import { PurchaseRequisitionEntity } from './entities/purchase_requisition.entity.js'
import { PurchaseRequisitionLineEntity } from './entities/purchase_requisition_line.entity.js'
import { VendorInvoiceEntity } from './entities/vendor_invoice.entity.js'
import { VendorInvoiceLineEntity } from './entities/vendor_invoice_line.entity.js'
import { TypeOrmProcurementService } from './services/typeorm_procurement_service.js'
import { ProcurementController } from './controllers/procurement.controller.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierEntity,
      PurchaseOrderEntity,
      PurchaseOrderLineEntity,
      GoodsReceiptEntity,
      GoodsReceiptLineEntity,
      PurchaseRequisitionEntity,
      PurchaseRequisitionLineEntity,
      VendorInvoiceEntity,
      VendorInvoiceLineEntity,
    ]),
    InventoryModule,
    FinanceModule,
  ],
  controllers: [ProcurementController],
  providers: [
    {
      provide: ProcurementContract,
      useClass: TypeOrmProcurementService,
    },
  ],
  exports: [ProcurementContract],
})
export class ProcurementModule {}
