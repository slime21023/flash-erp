import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FinanceModule } from '@modules/finance/finance.module.js'
import { SalesModule } from '@modules/sales/sales.module.js'
import { TreasuryContract } from './contracts/index.js'
import { BankAccountEntity } from './entities/bank_account.entity.js'
import { PaymentVoucherEntity } from './entities/payment_voucher.entity.js'
import { PaymentVoucherLineEntity } from './entities/payment_voucher_line.entity.js'
import { ReceiptVoucherEntity } from './entities/receipt_voucher.entity.js'
import { ReceiptVoucherLineEntity } from './entities/receipt_voucher_line.entity.js'
import { BankStatementEntity } from './entities/bank_statement.entity.js'
import { BankStatementLineEntity } from './entities/bank_statement_line.entity.js'
import { TypeOrmTreasuryService } from './services/typeorm_treasury_service.js'
import { TreasuryController } from './controllers/treasury.controller.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankAccountEntity,
      PaymentVoucherEntity,
      PaymentVoucherLineEntity,
      ReceiptVoucherEntity,
      ReceiptVoucherLineEntity,
      BankStatementEntity,
      BankStatementLineEntity,
    ]),
    FinanceModule,
    SalesModule,
  ],
  controllers: [TreasuryController],
  providers: [
    {
      provide: TreasuryContract,
      useClass: TypeOrmTreasuryService,
    },
  ],
  exports: [TreasuryContract],
})
export class TreasuryModule {}
