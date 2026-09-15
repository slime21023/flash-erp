import type { MigrationInterface, QueryRunner } from 'typeorm'

export class ProductionHardening1710000003000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ'
    )
    await queryRunner.query(
      'ALTER TABLE audit_entries ADD COLUMN IF NOT EXISTS event_id VARCHAR(128)'
    )
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_entries_event_id ON audit_entries (event_id) WHERE event_id IS NOT NULL'
    )

    await addForeignKey(
      queryRunner,
      'user_organization_scopes',
      'organization_unit_id',
      'organization_units',
      'fk_user_scopes_organization_unit'
    )
    await addForeignKey(
      queryRunner,
      'inventory_warehouses',
      'organization_unit_id',
      'organization_units',
      'fk_inventory_warehouses_organization_unit'
    )
    await addForeignKey(
      queryRunner,
      'inventory_stock_reservations',
      'item_id',
      'inventory_items',
      'fk_inventory_reservations_item'
    )
    await addForeignKey(
      queryRunner,
      'inventory_stock_reservations',
      'warehouse_id',
      'inventory_warehouses',
      'fk_inventory_reservations_warehouse'
    )

    for (const [table, column, constraint] of companyReferences) {
      await addForeignKey(queryRunner, table, column, 'organization_units', constraint)
    }

    await addCheck(
      queryRunner,
      'organization_units',
      'ck_organization_units_kind',
      "kind IN ('COMPANY', 'PLANT', 'WAREHOUSE')"
    )
    await addCheck(
      queryRunner,
      'inventory_movements',
      'ck_inventory_movements_nonzero_quantity',
      'quantity_delta <> 0'
    )
    await addCheck(
      queryRunner,
      'inventory_movements',
      'ck_inventory_movements_nonnegative_cost',
      'unit_cost_minor_units >= 0'
    )
    await addCheck(
      queryRunner,
      'inventory_stock_reservations',
      'ck_inventory_reservations_positive_quantity',
      'quantity > 0'
    )
    await addCheck(
      queryRunner,
      'accounting_periods',
      'ck_accounting_periods_valid_range',
      'starts_on <= ends_on'
    )
    await addCheck(
      queryRunner,
      'journal_entries',
      'ck_journal_entries_nonnegative_totals',
      'total_debit_minor_units >= 0 AND total_credit_minor_units >= 0'
    )
    await addCheck(
      queryRunner,
      'journal_entry_lines',
      'ck_journal_lines_nonnegative_amounts',
      'debit_minor_units >= 0 AND credit_minor_units >= 0'
    )
    await addCheck(
      queryRunner,
      'journal_entry_lines',
      'ck_journal_lines_single_side',
      '((debit_minor_units > 0)::integer + (credit_minor_units > 0)::integer) = 1'
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [, , constraint] of companyReferences) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${constraintTable(constraint)}" DROP CONSTRAINT IF EXISTS "${constraint}"`
      )
    }
    for (const [table, , constraint] of [
      ['user_organization_scopes', 'organization_unit_id', 'fk_user_scopes_organization_unit'],
      ['inventory_warehouses', 'organization_unit_id', 'fk_inventory_warehouses_organization_unit'],
      ['inventory_stock_reservations', 'item_id', 'fk_inventory_reservations_item'],
      ['inventory_stock_reservations', 'warehouse_id', 'fk_inventory_reservations_warehouse'],
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`
      )
    }
    for (const [table, constraint] of checks) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`
      )
    }
    await queryRunner.query('DROP INDEX IF EXISTS uq_audit_entries_event_id')
    await queryRunner.query('ALTER TABLE IF EXISTS audit_entries DROP COLUMN IF EXISTS event_id')
    await queryRunner.query(
      'ALTER TABLE IF EXISTS outbox_events DROP COLUMN IF EXISTS dead_lettered_at'
    )
  }
}

const companyReferences = [
  ['inventory_items', 'company_id', 'fk_inventory_items_company'],
  ['inventory_warehouses', 'company_id', 'fk_inventory_warehouses_company'],
  ['inventory_movements', 'company_id', 'fk_inventory_movements_company'],
  ['inventory_stock_reservations', 'company_id', 'fk_inventory_reservations_company'],
  ['accounts', 'company_id', 'fk_accounts_company'],
  ['accounting_periods', 'company_id', 'fk_accounting_periods_company'],
  ['company_accounting_settings', 'company_id', 'fk_company_accounting_settings_company'],
  ['journal_entries', 'company_id', 'fk_journal_entries_company'],
  ['suppliers', 'company_id', 'fk_suppliers_company'],
  ['purchase_orders', 'company_id', 'fk_purchase_orders_company'],
  ['procurement_purchase_requisitions', 'company_id', 'fk_purchase_requisitions_company'],
  ['procurement_vendor_invoices', 'company_id', 'fk_vendor_invoices_company'],
  ['sales_customers', 'company_id', 'fk_sales_customers_company'],
  ['sales_orders', 'company_id', 'fk_sales_orders_company'],
  ['sales_shipments', 'company_id', 'fk_sales_shipments_company'],
  ['boms', 'companyId', 'fk_boms_company'],
  ['work_orders', 'companyId', 'fk_work_orders_company'],
  ['bank_accounts', 'companyId', 'fk_bank_accounts_company'],
  ['payment_vouchers', 'companyId', 'fk_payment_vouchers_company'],
  ['receipt_vouchers', 'companyId', 'fk_receipt_vouchers_company'],
] as const

const checks = [
  ['organization_units', 'ck_organization_units_kind'],
  ['inventory_movements', 'ck_inventory_movements_nonzero_quantity'],
  ['inventory_movements', 'ck_inventory_movements_nonnegative_cost'],
  ['inventory_stock_reservations', 'ck_inventory_reservations_positive_quantity'],
  ['accounting_periods', 'ck_accounting_periods_valid_range'],
  ['journal_entries', 'ck_journal_entries_nonnegative_totals'],
  ['journal_entry_lines', 'ck_journal_lines_nonnegative_amounts'],
  ['journal_entry_lines', 'ck_journal_lines_single_side'],
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
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}')
        AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${referencedTable}" ("id") ON DELETE RESTRICT;
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
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (${expression});
      END IF;
    END $$;
  `)
}

function constraintTable(constraint: string): string {
  return companyReferences.find(([, , name]) => name === constraint)?.[0] ?? ''
}
