import type { MigrationInterface, QueryRunner } from 'typeorm'

const columns = [
  ['boms', 'companyid', 'companyId'],
  ['boms', 'parentitemid', 'parentItemId'],
  ['boms', 'basequantity', 'baseQuantity'],
  ['bom_lines', 'bomid', 'bomId'],
  ['bom_lines', 'componentitemid', 'componentItemId'],
  ['bom_lines', 'quantityperbase', 'quantityPerBase'],
  ['bom_lines', 'scrappercentagebasispoints', 'scrapPercentageBasisPoints'],
  ['work_orders', 'companyid', 'companyId'],
  ['work_orders', 'workordernumber', 'workOrderNumber'],
  ['work_orders', 'bomid', 'bomId'],
  ['work_orders', 'outputitemid', 'outputItemId'],
  ['work_orders', 'outputwarehouseid', 'outputWarehouseId'],
  ['work_orders', 'rawmaterialwarehouseid', 'rawMaterialWarehouseId'],
  ['work_orders', 'targetquantity', 'targetQuantity'],
  ['work_orders', 'completedquantity', 'completedQuantity'],
  ['work_orders', 'actualdirectmaterialcostminorunits', 'actualDirectMaterialCostMinorUnits'],
  ['work_orders', 'allocatedoverheadcostminorunits', 'allocatedOverheadCostMinorUnits'],
  ['work_orders', 'totalcostminorunits', 'totalCostMinorUnits'],
  ['work_orders', 'unitcostminorunits', 'unitCostMinorUnits'],
  ['work_orders', 'completedat', 'completedAt'],
  ['work_order_lines', 'workorderid', 'workOrderId'],
  ['work_order_lines', 'componentitemid', 'componentItemId'],
  ['work_order_lines', 'plannedquantity', 'plannedQuantity'],
  ['work_order_lines', 'issuedquantity', 'issuedQuantity'],
  ['bank_accounts', 'companyid', 'companyId'],
  ['bank_accounts', 'accountnumber', 'accountNumber'],
  ['bank_accounts', 'bankcode', 'bankCode'],
  ['bank_accounts', 'bankname', 'bankName'],
  ['bank_accounts', 'accountname', 'accountName'],
  ['bank_accounts', 'glaccountid', 'glAccountId'],
  ['bank_accounts', 'currentbalanceminorunits', 'currentBalanceMinorUnits'],
  ['bank_accounts', 'isactive', 'isActive'],
  ['bank_statements', 'bankaccountid', 'bankAccountId'],
  ['bank_statements', 'statementnumber', 'statementNumber'],
  ['bank_statements', 'statementdate', 'statementDate'],
  ['bank_statements', 'openingbalanceminorunits', 'openingBalanceMinorUnits'],
  ['bank_statements', 'closingbalanceminorunits', 'closingBalanceMinorUnits'],
  ['bank_statement_lines', 'bankstatementid', 'bankStatementId'],
  ['bank_statement_lines', 'transactiondate', 'transactionDate'],
  ['bank_statement_lines', 'amountminorunits', 'amountMinorUnits'],
  ['bank_statement_lines', 'ismatched', 'isMatched'],
  ['bank_statement_lines', 'matchedvoucherid', 'matchedVoucherId'],
  ['payment_vouchers', 'companyid', 'companyId'],
  ['payment_vouchers', 'bankaccountid', 'bankAccountId'],
  ['payment_vouchers', 'paymentnumber', 'paymentNumber'],
  ['payment_vouchers', 'paymentdate', 'paymentDate'],
  ['payment_vouchers', 'beneficiarytype', 'beneficiaryType'],
  ['payment_vouchers', 'beneficiaryid', 'beneficiaryId'],
  ['payment_vouchers', 'amountminorunits', 'amountMinorUnits'],
  ['payment_vouchers', 'journalentryid', 'journalEntryId'],
  ['payment_vouchers', 'postedat', 'postedAt'],
  ['payment_voucher_lines', 'paymentvoucherid', 'paymentVoucherId'],
  ['payment_voucher_lines', 'invoiceid', 'invoiceId'],
  ['payment_voucher_lines', 'appliedamountminorunits', 'appliedAmountMinorUnits'],
  ['receipt_vouchers', 'companyid', 'companyId'],
  ['receipt_vouchers', 'bankaccountid', 'bankAccountId'],
  ['receipt_vouchers', 'receiptnumber', 'receiptNumber'],
  ['receipt_vouchers', 'receiptdate', 'receiptDate'],
  ['receipt_vouchers', 'payertype', 'payerType'],
  ['receipt_vouchers', 'payerid', 'payerId'],
  ['receipt_vouchers', 'amountminorunits', 'amountMinorUnits'],
  ['receipt_vouchers', 'journalentryid', 'journalEntryId'],
  ['receipt_vouchers', 'postedat', 'postedAt'],
  ['receipt_voucher_lines', 'receiptvoucherid', 'receiptVoucherId'],
  ['receipt_voucher_lines', 'referenceid', 'referenceId'],
  ['receipt_voucher_lines', 'appliedamountminorunits', 'appliedAmountMinorUnits'],
] as const

export class FixCamelCaseColumns1710000001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to] of columns) await renameIfPresent(queryRunner, table, from, to)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to] of [...columns].reverse()) {
      await renameIfPresent(queryRunner, table, to, from)
    }
  }
}

async function renameIfPresent(
  queryRunner: QueryRunner,
  table: string,
  from: string,
  to: string
): Promise<void> {
  await queryRunner.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${from}'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${to}'
      ) THEN
        EXECUTE 'ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"';
      END IF;
    END $$;
  `)
}
