import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class BomLineDto {
  @IsString()
  @IsNotEmpty()
  componentItemId!: string

  @Matches(/^\d+$/)
  quantityPerBase!: string

  @IsInt()
  @IsOptional()
  scrapPercentageBasisPoints?: number

  @IsString()
  @IsOptional()
  memo?: string
}

export class RegisterBomDto {
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

  @IsString()
  @IsNotEmpty()
  parentItemId!: string

  @Matches(/^\d+$/)
  @IsOptional()
  baseQuantity?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines!: BomLineDto[]
}

export class CreateWorkOrderDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  workOrderNumber!: string

  @IsString()
  @IsNotEmpty()
  bomId!: string

  @IsString()
  @IsNotEmpty()
  outputWarehouseId!: string

  @IsString()
  @IsNotEmpty()
  rawMaterialWarehouseId!: string

  @Matches(/^\d+$/)
  targetQuantity!: string

  @IsString()
  @IsOptional()
  memo?: string
}

export class IssueMaterialLineDto {
  @IsString()
  @IsNotEmpty()
  componentItemId!: string

  @Matches(/^\d+$/)
  quantity!: string
}

export class IssueMaterialsDto {
  @IsString()
  @IsNotEmpty()
  issueDate!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueMaterialLineDto)
  lines!: IssueMaterialLineDto[]
}

export class CompleteWorkOrderDto {
  @Matches(/^\d+$/)
  completedQuantity!: string

  @IsString()
  @IsNotEmpty()
  completionDate!: string
}

export class AllocateOverheadDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsOptional()
  overheadAccount?: string

  @Matches(/^\d+$/)
  totalPoolAmountMinorUnits!: string

  @IsString()
  @IsOptional()
  currency?: string

  @IsString()
  @IsNotEmpty()
  accountingDate!: string

  @IsIn(['COMPLETED_QUANTITY', 'DIRECT_MATERIAL_COST'])
  allocationBase!: 'COMPLETED_QUANTITY' | 'DIRECT_MATERIAL_COST'

  @IsArray()
  @IsString({ each: true })
  workOrderIds!: string[]
}
