import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'

export class ReverseJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  number!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  accountingDate!: string

  @IsOptional()
  @IsString()
  memo?: string
}
