import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator'

export class JournalLineDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^-?\d+$/)
  debitMinorUnits!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^-?\d+$/)
  creditMinorUnits!: string

  @IsOptional()
  @IsString()
  memo?: string
}

export class CreateJournalEntryDraftDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  number!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  accountingDate!: string

  @Matches(/^[A-Z]{3}$/)
  currency!: string

  @IsOptional()
  @IsString()
  memo?: string

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[]
}
