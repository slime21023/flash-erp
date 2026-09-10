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

export class RegisterCustomerDto {
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

  @IsOptional()
  @IsString()
  paymentTerms?: string

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  creditLimitMinorUnits!: string
}

export class SalesOrderLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string

  @IsString()
  @IsNotEmpty()
  warehouseId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  orderedQuantity!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  unitPriceMinorUnits!: string

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string
}

export class CreateSalesOrderDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  customerId!: string

  @IsString()
  @IsNotEmpty()
  number!: string

  @IsOptional()
  @IsString()
  memo?: string

  @IsOptional()
  @IsNumber()
  taxRateBasisPoints?: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineDto)
  lines!: SalesOrderLineDto[]
}

export class ShipmentLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  shippedQuantity!: string
}

export class CreateShipmentDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  salesOrderId!: string

  @IsString()
  @IsNotEmpty()
  warehouseId!: string

  @IsString()
  @IsNotEmpty()
  shipmentDate!: string

  @IsOptional()
  @IsString()
  arVoucherId?: string

  @IsOptional()
  @IsString()
  cogsVoucherId?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentLineDto)
  lines?: ShipmentLineDto[]
}
