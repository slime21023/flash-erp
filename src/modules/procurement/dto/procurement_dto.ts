import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator'

export class RegisterSupplierDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  code!: string

  @IsString()
  @IsNotEmpty()
  name!: string
}

export class PurchaseOrderLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  orderedQuantity!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  unitCostMinorUnits!: string

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  supplierId!: string

  @IsString()
  @IsNotEmpty()
  number!: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[]
}

export class GoodsReceiptLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  receivedQuantity!: string
}

export class ReceiveGoodsDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string

  @IsString()
  @IsNotEmpty()
  warehouseId!: string

  @IsString()
  @IsNotEmpty()
  receivedAt!: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines?: GoodsReceiptLineDto[]
}

export class PurchaseRequisitionLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  requestedQuantity!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  estimatedCostMinorUnits!: string

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string
}

export class CreatePurchaseRequisitionDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  requesterId!: string

  @IsString()
  @IsNotEmpty()
  number!: string

  @IsOptional()
  @IsString()
  memo?: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequisitionLineDto)
  lines!: PurchaseRequisitionLineDto[]
}

export class ApprovePurchaseRequisitionDto {
  @IsOptional()
  @IsString()
  comment?: string
}

export class ConvertRequisitionDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string

  @IsString()
  @IsNotEmpty()
  purchaseOrderNumber!: string

  @IsString()
  @IsNotEmpty()
  supplierId!: string
}

export class VendorInvoiceLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  invoicedQuantity!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  unitPriceMinorUnits!: string
}

export class RegisterVendorInvoiceDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  supplierId!: string

  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string

  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string

  @IsString()
  @IsNotEmpty()
  invoiceDate!: string

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string

  @IsOptional()
  @IsNumber()
  taxRateBasisPoints?: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VendorInvoiceLineDto)
  lines!: VendorInvoiceLineDto[]
}

export class MatchVendorInvoiceDto {
  @IsOptional()
  @IsNumber()
  quantityToleranceBasisPoints?: number

  @IsOptional()
  @IsNumber()
  priceToleranceBasisPoints?: number

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  amountToleranceMinorUnits?: string
}

export class CreateApVoucherDto {
  @IsString()
  @IsNotEmpty()
  voucherId!: string

  @IsString()
  @IsNotEmpty()
  voucherNumber!: string

  @IsString()
  @IsNotEmpty()
  accountingDate!: string

  @IsOptional()
  @IsString()
  inventoryAccountId?: string

  @IsOptional()
  @IsString()
  taxAccountId?: string

  @IsOptional()
  @IsString()
  payableAccountId?: string

  @IsOptional()
  @IsString()
  memo?: string
}
