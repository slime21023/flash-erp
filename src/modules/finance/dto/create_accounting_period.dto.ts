import { IsNotEmpty, IsString, Matches } from 'class-validator'

export class CreateAccountingPeriodDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  code!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn!: string
}
