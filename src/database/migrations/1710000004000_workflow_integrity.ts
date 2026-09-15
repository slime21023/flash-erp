import type { MigrationInterface, QueryRunner } from 'typeorm'

export class WorkflowIntegrity1710000004000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, statement] of uniqueIndexes) {
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ${statement}`)
    }

    for (const [table, column, referencedTable, constraint] of foreignKeys) {
      await addForeignKey(queryRunner, table, column, referencedTable, constraint)
    }

    for (const [table, name, expression] of checks) {
      await addCheck(queryRunner, table, name, expression)
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of uniqueIndexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`)
    }
    for (const [, , , constraint] of foreignKeys) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${constraintTable(constraint)}" DROP CONSTRAINT IF EXISTS "${constraint}"`
      )
    }
    for (const [table, name] of checks) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS "${name}"`
      )
    }
  }
}

const uniqueIndexes = [
  [
    'uq_journal_entries_reversal_of_id',
    'ON journal_entries (reversal_of_id) WHERE reversal_of_id IS NOT NULL',
  ],
  [
    'uq_vendor_invoices_journal_entry_id',
    'ON procurement_vendor_invoices (journal_entry_id) WHERE journal_entry_id IS NOT NULL',
  ],
  [
    'uq_sales_shipments_ar_journal_entry_id',
    'ON sales_shipments (ar_journal_entry_id) WHERE ar_journal_entry_id IS NOT NULL',
  ],
  [
    'uq_sales_shipments_cogs_journal_entry_id',
    'ON sales_shipments (cogs_journal_entry_id) WHERE cogs_journal_entry_id IS NOT NULL',
  ],
  [
    'uq_payment_vouchers_journal_entry_id',
    'ON payment_vouchers ("journalEntryId") WHERE "journalEntryId" IS NOT NULL',
  ],
  [
    'uq_receipt_vouchers_journal_entry_id',
    'ON receipt_vouchers ("journalEntryId") WHERE "journalEntryId" IS NOT NULL',
  ],
  ['uq_bank_accounts_company_account_number', 'ON bank_accounts ("companyId", "accountNumber")'],
  ['uq_payment_vouchers_company_number', 'ON payment_vouchers ("companyId", "paymentNumber")'],
  ['uq_receipt_vouchers_company_number', 'ON receipt_vouchers ("companyId", "receiptNumber")'],
  ['uq_boms_company_code', 'ON boms ("companyId", code)'],
  ['uq_work_orders_company_number', 'ON work_orders ("companyId", "workOrderNumber")'],
  [
    'uq_inventory_reservations_reference_line',
    'ON inventory_stock_reservations (reference_type, reference_id, item_id, warehouse_id)',
  ],
] as const

const foreignKeys = [
  ['journal_entries', 'reversal_of_id', 'journal_entries', 'fk_journal_entries_reversal_of'],
  [
    'procurement_vendor_invoices',
    'journal_entry_id',
    'journal_entries',
    'fk_vendor_invoices_journal_entry',
  ],
  ['purchase_orders', 'supplier_id', 'suppliers', 'fk_purchase_orders_supplier'],
  ['purchase_order_lines', 'item_id', 'inventory_items', 'fk_purchase_order_lines_item'],
  [
    'procurement_purchase_requisitions',
    'converted_purchase_order_id',
    'purchase_orders',
    'fk_requisitions_converted_purchase_order',
  ],
  [
    'procurement_purchase_requisition_lines',
    'item_id',
    'inventory_items',
    'fk_requisition_lines_item',
  ],
  ['goods_receipts', 'purchase_order_id', 'purchase_orders', 'fk_goods_receipts_purchase_order'],
  ['goods_receipts', 'warehouse_id', 'inventory_warehouses', 'fk_goods_receipts_warehouse'],
  ['procurement_goods_receipt_lines', 'item_id', 'inventory_items', 'fk_goods_receipt_lines_item'],
  ['procurement_vendor_invoices', 'supplier_id', 'suppliers', 'fk_vendor_invoices_supplier'],
  [
    'procurement_vendor_invoices',
    'purchase_order_id',
    'purchase_orders',
    'fk_vendor_invoices_purchase_order',
  ],
  [
    'procurement_vendor_invoice_lines',
    'item_id',
    'inventory_items',
    'fk_vendor_invoice_lines_item',
  ],
  ['sales_orders', 'customer_id', 'sales_customers', 'fk_sales_orders_customer'],
  ['sales_order_lines', 'item_id', 'inventory_items', 'fk_sales_order_lines_item'],
  ['sales_order_lines', 'warehouse_id', 'inventory_warehouses', 'fk_sales_order_lines_warehouse'],
  ['sales_shipments', 'sales_order_id', 'sales_orders', 'fk_sales_shipments_order'],
  ['sales_shipments', 'customer_id', 'sales_customers', 'fk_sales_shipments_customer'],
  ['sales_shipments', 'warehouse_id', 'inventory_warehouses', 'fk_sales_shipments_warehouse'],
  ['sales_shipments', 'ar_journal_entry_id', 'journal_entries', 'fk_sales_shipments_ar_journal'],
  [
    'sales_shipments',
    'cogs_journal_entry_id',
    'journal_entries',
    'fk_sales_shipments_cogs_journal',
  ],
  ['sales_shipment_lines', 'item_id', 'inventory_items', 'fk_sales_shipment_lines_item'],
  ['bank_accounts', 'glAccountId', 'accounts', 'fk_bank_accounts_gl_account'],
  ['bank_statements', 'bankAccountId', 'bank_accounts', 'fk_bank_statements_bank_account'],
  ['payment_vouchers', 'bankAccountId', 'bank_accounts', 'fk_payment_vouchers_bank_account'],
  ['payment_vouchers', 'journalEntryId', 'journal_entries', 'fk_payment_vouchers_journal_entry'],
  ['receipt_vouchers', 'bankAccountId', 'bank_accounts', 'fk_receipt_vouchers_bank_account'],
  ['receipt_vouchers', 'journalEntryId', 'journal_entries', 'fk_receipt_vouchers_journal_entry'],
  [
    'payment_voucher_lines',
    'invoiceId',
    'procurement_vendor_invoices',
    'fk_payment_voucher_lines_invoice',
  ],
  ['boms', 'parentItemId', 'inventory_items', 'fk_boms_parent_item'],
  ['bom_lines', 'componentItemId', 'inventory_items', 'fk_bom_lines_component_item'],
  ['work_orders', 'bomId', 'boms', 'fk_work_orders_bom'],
  ['work_orders', 'outputItemId', 'inventory_items', 'fk_work_orders_output_item'],
  ['work_orders', 'outputWarehouseId', 'inventory_warehouses', 'fk_work_orders_output_warehouse'],
  [
    'work_orders',
    'rawMaterialWarehouseId',
    'inventory_warehouses',
    'fk_work_orders_raw_material_warehouse',
  ],
  ['work_order_lines', 'componentItemId', 'inventory_items', 'fk_work_order_lines_component_item'],
  ['work_order_lines', 'warehouseId', 'inventory_warehouses', 'fk_work_order_lines_warehouse'],
] as const

const checks = [
  ['purchase_order_lines', 'ck_purchase_order_lines_positive_quantity', 'ordered_quantity > 0'],
  [
    'purchase_order_lines',
    'ck_purchase_order_lines_nonnegative_cost',
    'unit_cost_minor_units >= 0',
  ],
  [
    'procurement_purchase_requisition_lines',
    'ck_requisition_lines_positive_quantity',
    'requested_quantity > 0',
  ],
  [
    'procurement_purchase_requisition_lines',
    'ck_requisition_lines_nonnegative_cost',
    'estimated_cost_minor_units >= 0',
  ],
  [
    'procurement_goods_receipt_lines',
    'ck_goods_receipt_lines_positive_quantity',
    'received_quantity > 0',
  ],
  [
    'procurement_vendor_invoice_lines',
    'ck_vendor_invoice_lines_positive_quantity',
    'invoiced_quantity > 0',
  ],
  [
    'procurement_vendor_invoice_lines',
    'ck_vendor_invoice_lines_nonnegative_price',
    'unit_price_minor_units >= 0',
  ],
  [
    'procurement_vendor_invoice_lines',
    'ck_vendor_invoice_lines_nonnegative_total',
    'line_total_minor_units >= 0',
  ],
  [
    'procurement_vendor_invoices',
    'ck_vendor_invoices_tax_rate',
    'tax_rate_basis_points BETWEEN 0 AND 10000',
  ],
  [
    'procurement_vendor_invoices',
    'ck_vendor_invoices_nonnegative_amounts',
    'net_amount_minor_units >= 0 AND tax_amount_minor_units >= 0 AND total_amount_minor_units >= 0',
  ],
  ['sales_order_lines', 'ck_sales_order_lines_positive_quantity', 'ordered_quantity > 0'],
  [
    'sales_order_lines',
    'ck_sales_order_lines_nonnegative_shipped',
    'shipped_quantity >= 0 AND shipped_quantity <= ordered_quantity',
  ],
  [
    'sales_order_lines',
    'ck_sales_order_lines_nonnegative_price',
    'unit_price_minor_units >= 0 AND line_total_minor_units >= 0',
  ],
  ['sales_orders', 'ck_sales_orders_tax_rate', 'tax_rate_basis_points BETWEEN 0 AND 10000'],
  [
    'sales_orders',
    'ck_sales_orders_nonnegative_amounts',
    'net_amount_minor_units >= 0 AND tax_amount_minor_units >= 0 AND total_amount_minor_units >= 0',
  ],
  ['sales_shipment_lines', 'ck_sales_shipment_lines_positive_quantity', 'shipped_quantity > 0'],
  [
    'sales_shipment_lines',
    'ck_sales_shipment_lines_nonnegative_amounts',
    'unit_price_minor_units >= 0 AND line_total_minor_units >= 0',
  ],
] as const

async function addForeignKey(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  referencedTable: string,
  constraint: string
): Promise<void> {
  await queryRunner.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${constraint}'
      ) THEN
        ALTER TABLE "${table}"
          ADD CONSTRAINT "${constraint}"
          FOREIGN KEY ("${column}") REFERENCES "${referencedTable}" ("id") ON DELETE RESTRICT;
      END IF;
    END $$;
  `)
}

async function addCheck(
  queryRunner: QueryRunner,
  table: string,
  constraint: string,
  expression: string
): Promise<void> {
  await queryRunner.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '${table}'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${constraint}'
      ) THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (${expression});
      END IF;
    END $$;
  `)
}

function constraintTable(constraint: string): string {
  return foreignKeys.find(([, , , name]) => name === constraint)?.[0] ?? ''
}
