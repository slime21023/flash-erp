import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { TreasuryContract } from '../contracts/index.js'
import { treasuryApiContract } from '../contracts/treasury_api_contract.js'

@Controller()
export class TreasuryController {
  constructor(private readonly treasury: TreasuryContract) {}

  @RequirePermission('treasury.account.create')
  @Implement(treasuryApiContract.registerBankAccount)
  registerBankAccount() {
    return implement(treasuryApiContract.registerBankAccount).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.account.read')
  @Implement(treasuryApiContract.getBankAccount)
  getBankAccount() {
    return implement(treasuryApiContract.getBankAccount).handler(async ({ input: { id } }) => {
      const result = await this.treasury.getBankAccount(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.account.read')
  @Implement(treasuryApiContract.listBankAccounts)
  listBankAccounts() {
    return implement(treasuryApiContract.listBankAccounts).handler(
      async ({ input: { companyId } }) => {
        const result = await this.treasury.listBankAccounts(companyId || '')
        return unwrapResult(result)
      }
    )
  }

  @RequirePermission('treasury.payment.create')
  @Implement(treasuryApiContract.createPayment)
  createPayment() {
    return implement(treasuryApiContract.createPayment).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.payment.post')
  @Implement(treasuryApiContract.postPayment)
  postPayment() {
    return implement(treasuryApiContract.postPayment).handler(async ({ input: { id } }) => {
      const result = await this.treasury.postPayment(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.payment.read')
  @Implement(treasuryApiContract.getPayment)
  getPayment() {
    return implement(treasuryApiContract.getPayment).handler(async ({ input: { id } }) => {
      const result = await this.treasury.getPayment(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.receipt.create')
  @Implement(treasuryApiContract.createReceipt)
  createReceipt() {
    return implement(treasuryApiContract.createReceipt).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.receipt.post')
  @Implement(treasuryApiContract.postReceipt)
  postReceipt() {
    return implement(treasuryApiContract.postReceipt).handler(async ({ input: { id } }) => {
      const result = await this.treasury.postReceipt(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.receipt.read')
  @Implement(treasuryApiContract.getReceipt)
  getReceipt() {
    return implement(treasuryApiContract.getReceipt).handler(async ({ input: { id } }) => {
      const result = await this.treasury.getReceipt(id)
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.statement.import')
  @Implement(treasuryApiContract.importBankStatement)
  importBankStatement() {
    return implement(treasuryApiContract.importBankStatement).handler(async ({ input: dto }) => {
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
      return unwrapResult(result)
    })
  }

  @RequirePermission('treasury.statement.reconcile')
  @Implement(treasuryApiContract.reconcileBankStatement)
  reconcileBankStatement() {
    return implement(treasuryApiContract.reconcileBankStatement).handler(
      async ({ input: { id } }) => {
        const result = await this.treasury.reconcileBankStatement(id)
        return unwrapResult(result)
      }
    )
  }
}
