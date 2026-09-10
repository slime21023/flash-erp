import { IsNotEmpty, IsString, Matches } from 'class-validator'

export class RegisterUnitDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  code!: string

  @IsString()
  @IsNotEmpty()
  name!: string
}

export class RegisterItemDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  sku!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  unitId!: string
}

export class RegisterWarehouseDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  organizationUnitId!: string

  @IsString()
  @IsNotEmpty()
  code!: string

  @IsString()
  @IsNotEmpty()
  name!: string
}

export class RecordMovementDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  itemId!: string

  @IsString()
  @IsNotEmpty()
  warehouseId!: string

  @IsString()
  @IsNotEmpty()
  sourceType!: string

  @IsString()
  @IsNotEmpty()
  sourceId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^-?\d+$/)
  quantityDelta!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  unitCostMinorUnits!: string

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string

  @IsString()
  @IsNotEmpty()
  occurredAt!: string
}
