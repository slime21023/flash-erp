import { IsIn, IsNotEmpty, IsString } from 'class-validator'
import type { NormalBalance } from '../contracts/account_contract.js'

export class CreateAccountDto {
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

  @IsIn(['DEBIT', 'CREDIT'])
  normalBalance!: NormalBalance
}
