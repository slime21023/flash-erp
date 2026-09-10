import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class RegisterBankAccountDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  accountNumber!: string

  @IsString()
  @IsNotEmpty()
  bankCode!: string

  @IsString()
  @IsNotEmpty()
  bankName!: string

  @IsString()
  @IsNotEmpty()
  accountName!: string

  @IsString()
  @IsOptional()
  currency?: string

  @IsString()
  @IsNotEmpty()
  glAccountId!: string

  @Matches(/^-?\d+$/)
  @IsOptional()
  initialBalanceMinorUnits?: string
}

export class PaymentLineDto {
  @IsString()
  @IsNotEmpty()
  invoiceId!: string

  @Matches(/^\d+$/)
  appliedAmountMinorUnits!: string

  @IsString()
  @IsOptional()
  memo?: string
}

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  bankAccountId!: string

  @IsString()
  @IsNotEmpty()
  paymentNumber!: string

  @IsString()
  @IsNotEmpty()
  paymentDate!: string

  @IsIn(['SUPPLIER', 'OTHER'])
  beneficiaryType!: 'SUPPLIER' | 'OTHER'

  @IsString()
  @IsNotEmpty()
  beneficiaryId!: string

  @IsString()
  @IsOptional()
  currency?: string

  @Matches(/^\d+$/)
  amountMinorUnits!: string

  @IsString()
  @IsOptional()
  glPayableAccountId?: string

  @IsString()
  @IsOptional()
  memo?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  @IsOptional()
  lines?: PaymentLineDto[]
}

export class ReceiptLineDto {
  @IsString()
  @IsNotEmpty()
  referenceId!: string

  @Matches(/^\d+$/)
  appliedAmountMinorUnits!: string

  @IsString()
  @IsOptional()
  memo?: string
}

export class CreateReceiptDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  companyId!: string

  @IsString()
  @IsNotEmpty()
  bankAccountId!: string

  @IsString()
  @IsNotEmpty()
  receiptNumber!: string

  @IsString()
  @IsNotEmpty()
  receiptDate!: string

  @IsIn(['CUSTOMER', 'OTHER'])
  payerType!: 'CUSTOMER' | 'OTHER'

  @IsString()
  @IsNotEmpty()
  payerId!: string

  @IsString()
  @IsOptional()
  currency?: string

  @Matches(/^\d+$/)
  amountMinorUnits!: string

  @IsString()
  @IsOptional()
  glReceivableAccountId?: string

  @IsString()
  @IsOptional()
  memo?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  @IsOptional()
  lines?: ReceiptLineDto[]
}

export class BankStatementLineDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  transactionDate!: string

  @IsIn(['DEBIT', 'CREDIT'])
  direction!: 'DEBIT' | 'CREDIT'

  @Matches(/^-?\d+$/)
  amountMinorUnits!: string

  @IsString()
  @IsNotEmpty()
  reference!: string

  @IsString()
  @IsOptional()
  description?: string
}

export class ImportBankStatementDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  bankAccountId!: string

  @IsString()
  @IsNotEmpty()
  statementNumber!: string

  @IsString()
  @IsNotEmpty()
  statementDate!: string

  @Matches(/^-?\d+$/)
  openingBalanceMinorUnits!: string

  @Matches(/^-?\d+$/)
  closingBalanceMinorUnits!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankStatementLineDto)
  lines!: BankStatementLineDto[]
}
