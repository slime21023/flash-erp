import { IsNotEmpty, IsString, Length, Matches } from 'class-validator'

export class CompanyAccountingSettingsDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  baseCurrency!: string
}
