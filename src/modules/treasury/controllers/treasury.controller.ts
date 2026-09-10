import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ResultPresenter } from '@platform/http/index.js'
import { RequirePermission } from '@platform/security/index.js'
import { TreasuryContract } from '../contracts/index.js'
import {
  CreatePaymentDto,
  CreateReceiptDto,
  ImportBankStatementDto,
  RegisterBankAccountDto,
} from '../dto/treasury_dto.js'

@Controller('treasury')
export class TreasuryController {
  constructor(private readonly treasury: TreasuryContract) {}

  @RequirePermission('treasury.account.create')
  @Post('accounts')
  async registerBankAccount(@Body() dto: RegisterBankAccountDto, @Res() res: Response) {
    const result = await this.treasury.registerBankAccount({
      id: dto.id,
      companyId: dto.companyId,
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
      bankName: dto.bankName,
      accountName: dto.accountName,
      currency: dto.currency,
      glAccountId: dto.glAccountId,
      initialBalanceMinorUnits: dto.initialBalanceMinorUnits
        ? BigInt(dto.initialBalanceMinorUnits)
        : 0n,
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @Get('accounts/:id')
  async getBankAccount(@Param('id') id: string, @Res() res: Response) {
    const result = await this.treasury.getBankAccount(id)
    return ResultPresenter.handle(res, result)
  }

  @Get('accounts')
  async listBankAccounts(@Query('companyId') companyId: string, @Res() res: Response) {
    const result = await this.treasury.listBankAccounts(companyId || '')
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('treasury.payment.create')
  @Post('payments')
  async createPayment(@Body() dto: CreatePaymentDto, @Res() res: Response) {
    const result = await this.treasury.createPayment({
      id: dto.id,
      companyId: dto.companyId,
      bankAccountId: dto.bankAccountId,
      paymentNumber: dto.paymentNumber,
      paymentDate: dto.paymentDate,
      beneficiaryType: dto.beneficiaryType,
      beneficiaryId: dto.beneficiaryId,
      currency: dto.currency,
      amountMinorUnits: BigInt(dto.amountMinorUnits),
      glPayableAccountId: dto.glPayableAccountId,
      memo: dto.memo,
      lines: dto.lines?.map((l) => ({
        invoiceId: l.invoiceId,
        appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
        memo: l.memo,
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('treasury.payment.post')
  @Post('payments/:id/post')
  async postPayment(@Param('id') id: string, @Res() res: Response) {
    const result = await this.treasury.postPayment(id)
    return ResultPresenter.handle(res, result)
  }

  @Get('payments/:id')
  async getPayment(@Param('id') id: string, @Res() res: Response) {
    const result = await this.treasury.getPayment(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('treasury.receipt.create')
  @Post('receipts')
  async createReceipt(@Body() dto: CreateReceiptDto, @Res() res: Response) {
    const result = await this.treasury.createReceipt({
      id: dto.id,
      companyId: dto.companyId,
      bankAccountId: dto.bankAccountId,
      receiptNumber: dto.receiptNumber,
      receiptDate: dto.receiptDate,
      payerType: dto.payerType,
      payerId: dto.payerId,
      currency: dto.currency,
      amountMinorUnits: BigInt(dto.amountMinorUnits),
      glReceivableAccountId: dto.glReceivableAccountId,
      memo: dto.memo,
      lines: dto.lines?.map((l) => ({
        referenceId: l.referenceId,
        appliedAmountMinorUnits: BigInt(l.appliedAmountMinorUnits),
        memo: l.memo,
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('treasury.receipt.post')
  @Post('receipts/:id/post')
  async postReceipt(@Param('id') id: string, @Res() res: Response) {
    const result = await this.treasury.postReceipt(id)
    return ResultPresenter.handle(res, result)
  }

  @Get('receipts/:id')
  async getReceipt(@Param('id') id: string, @Res() res: Response) {
    const result = await this.treasury.getReceipt(id)
    return ResultPresenter.handle(res, result)
  }

  @RequirePermission('treasury.statement.import')
  @Post('statements')
  async importBankStatement(@Body() dto: ImportBankStatementDto, @Res() res: Response) {
    const result = await this.treasury.importBankStatement({
      id: dto.id,
      bankAccountId: dto.bankAccountId,
      statementNumber: dto.statementNumber,
      statementDate: dto.statementDate,
      openingBalanceMinorUnits: BigInt(dto.openingBalanceMinorUnits),
      closingBalanceMinorUnits: BigInt(dto.closingBalanceMinorUnits),
      lines: dto.lines.map((l) => ({
        id: l.id,
        transactionDate: l.transactionDate,
        direction: l.direction,
        amountMinorUnits: BigInt(l.amountMinorUnits),
        reference: l.reference,
        description: l.description,
      })),
    })
    return ResultPresenter.handle(res, result, { successStatus: 201 })
  }

  @RequirePermission('treasury.statement.reconcile')
  @Post('statements/:id/reconcile')
  async reconcileBankStatement(@Param('id') id: string, @Res() res: Response) {
    const result = await this.treasury.reconcileBankStatement(id)
    return ResultPresenter.handle(res, result)
  }
}
