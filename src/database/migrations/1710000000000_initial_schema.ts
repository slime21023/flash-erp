import type { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialSchema1710000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    const statements = [
      `CREATE TABLE IF NOT EXISTS organization_units (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        kind VARCHAR(32) NOT NULL,
        parent_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_organization_units_parent FOREIGN KEY (parent_id) REFERENCES organization_units(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS local_users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(128) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS permissions (
        code VARCHAR(128) PRIMARY KEY,
        description VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(128) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS role_permissions (
        role_id VARCHAR(64) NOT NULL,
        permission_code VARCHAR(128) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (role_id, permission_code),
        CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
        CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS user_organization_scopes (
        user_id VARCHAR(64) NOT NULL,
        organization_unit_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, organization_unit_id),
        CONSTRAINT fk_user_scopes_user FOREIGN KEY (user_id) REFERENCES local_users(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS user_roles (
        user_id VARCHAR(64) NOT NULL,
        role_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, role_id),
        CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES local_users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_units (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_items (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        sku VARCHAR(128) NOT NULL,
        name VARCHAR(255) NOT NULL,
        unit_id VARCHAR(64) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, sku),
        CONSTRAINT fk_inventory_items_unit FOREIGN KEY (unit_id) REFERENCES inventory_units(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_warehouses (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        organization_unit_id VARCHAR(64) NOT NULL UNIQUE,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_movements (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL,
        source_type VARCHAR(64) NOT NULL,
        source_id VARCHAR(64) NOT NULL,
        quantity_delta BIGINT NOT NULL,
        unit_cost_minor_units BIGINT NOT NULL,
        currency VARCHAR(3) NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (source_type, source_id, item_id, warehouse_id),
        CONSTRAINT fk_inventory_movements_item FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_stock_reservations (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL,
        quantity BIGINT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        reference_type VARCHAR(64) NOT NULL,
        reference_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        normal_balance VARCHAR(16) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      )`,
      `CREATE TABLE IF NOT EXISTS accounting_periods (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        starts_on DATE NOT NULL,
        ends_on DATE NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      )`,
      `CREATE TABLE IF NOT EXISTS company_accounting_settings (
        company_id VARCHAR(64) PRIMARY KEY,
        base_currency VARCHAR(3) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        number VARCHAR(64) NOT NULL,
        accounting_date DATE NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
        currency VARCHAR(3) NOT NULL,
        total_debit_minor_units BIGINT NOT NULL,
        total_credit_minor_units BIGINT NOT NULL,
        memo VARCHAR(255),
        reversal_of_id VARCHAR(64),
        posted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, number)
      )`,
      `CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        journal_entry_id VARCHAR(64) NOT NULL,
        account_id VARCHAR(64) NOT NULL,
        debit_minor_units BIGINT NOT NULL,
        credit_minor_units BIGINT NOT NULL,
        line_number INTEGER NOT NULL,
        memo VARCHAR(255),
        UNIQUE (journal_entry_id, line_number),
        CONSTRAINT fk_journal_lines_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
        CONSTRAINT fk_journal_lines_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS audit_entries (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        actor_id VARCHAR(64),
        action VARCHAR(128) NOT NULL,
        entity_type VARCHAR(128) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        before_value JSONB,
        after_value JSONB,
        request_id VARCHAR(128),
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS boms (
        id VARCHAR(64) PRIMARY KEY,
        companyId VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        parentItemId VARCHAR(64) NOT NULL,
        baseQuantity VARCHAR(64) NOT NULL DEFAULT '1'
      )`,
      `CREATE TABLE IF NOT EXISTS bom_lines (
        id VARCHAR(64) PRIMARY KEY,
        bomId VARCHAR(64) NOT NULL,
        componentItemId VARCHAR(64) NOT NULL,
        quantityPerBase VARCHAR(64) NOT NULL,
        scrapPercentageBasisPoints INTEGER NOT NULL DEFAULT 0,
        memo TEXT,
        CONSTRAINT fk_bom_lines_bom FOREIGN KEY (bomId) REFERENCES boms(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS work_orders (
        id VARCHAR(64) PRIMARY KEY,
        companyId VARCHAR(64) NOT NULL,
        workOrderNumber VARCHAR(64) NOT NULL,
        bomId VARCHAR(64) NOT NULL,
        outputItemId VARCHAR(64) NOT NULL,
        outputWarehouseId VARCHAR(64) NOT NULL,
        rawMaterialWarehouseId VARCHAR(64) NOT NULL,
        targetQuantity VARCHAR(64) NOT NULL,
        completedQuantity VARCHAR(64) NOT NULL DEFAULT '0',
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        actualDirectMaterialCostMinorUnits VARCHAR(64) NOT NULL DEFAULT '0',
        allocatedOverheadCostMinorUnits VARCHAR(64) NOT NULL DEFAULT '0',
        totalCostMinorUnits VARCHAR(64) NOT NULL DEFAULT '0',
        unitCostMinorUnits VARCHAR(64) NOT NULL DEFAULT '0',
        memo TEXT,
        completedAt TIMESTAMPTZ
      )`,
      `CREATE TABLE IF NOT EXISTS work_order_lines (
        id VARCHAR(64) PRIMARY KEY,
        workOrderId VARCHAR(64) NOT NULL,
        componentItemId VARCHAR(64) NOT NULL,
        warehouseId VARCHAR(64) NOT NULL,
        plannedQuantity VARCHAR(64) NOT NULL,
        issuedQuantity VARCHAR(64) NOT NULL DEFAULT '0',
        CONSTRAINT fk_work_order_lines_order FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS suppliers (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        supplier_id VARCHAR(64) NOT NULL,
        number VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, number)
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        purchase_order_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        ordered_quantity BIGINT NOT NULL,
        unit_cost_minor_units BIGINT NOT NULL,
        currency VARCHAR(3) NOT NULL,
        UNIQUE (purchase_order_id, item_id),
        CONSTRAINT fk_purchase_order_lines_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS procurement_purchase_requisitions (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        requester_id VARCHAR(64) NOT NULL,
        number VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        memo VARCHAR(255),
        converted_purchase_order_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, number)
      )`,
      `CREATE TABLE IF NOT EXISTS procurement_purchase_requisition_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requisition_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        requested_quantity BIGINT NOT NULL,
        estimated_cost_minor_units BIGINT NOT NULL,
        currency VARCHAR(3) NOT NULL,
        CONSTRAINT fk_requisition_lines_requisition FOREIGN KEY (requisition_id) REFERENCES procurement_purchase_requisitions(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS goods_receipts (
        id VARCHAR(64) PRIMARY KEY,
        purchase_order_id VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS procurement_goods_receipt_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        received_quantity BIGINT NOT NULL,
        CONSTRAINT fk_goods_receipt_lines_receipt FOREIGN KEY (receipt_id) REFERENCES goods_receipts(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS procurement_vendor_invoices (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        supplier_id VARCHAR(64) NOT NULL,
        purchase_order_id VARCHAR(64) NOT NULL,
        invoice_number VARCHAR(64) NOT NULL,
        invoice_date VARCHAR(32) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        tax_rate_basis_points INTEGER NOT NULL DEFAULT 500,
        net_amount_minor_units BIGINT NOT NULL,
        tax_amount_minor_units BIGINT NOT NULL,
        total_amount_minor_units BIGINT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
        matched_at TIMESTAMPTZ,
        journal_entry_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, invoice_number)
      )`,
      `CREATE TABLE IF NOT EXISTS procurement_vendor_invoice_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        invoiced_quantity BIGINT NOT NULL,
        unit_price_minor_units BIGINT NOT NULL,
        line_total_minor_units BIGINT NOT NULL,
        CONSTRAINT fk_vendor_invoice_lines_invoice FOREIGN KEY (invoice_id) REFERENCES procurement_vendor_invoices(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS sales_customers (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        payment_terms VARCHAR(32) NOT NULL DEFAULT 'NET30',
        currency VARCHAR(3) NOT NULL DEFAULT 'TWD',
        credit_limit_minor_units BIGINT NOT NULL,
        current_outstanding_minor_units BIGINT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      )`,
      `CREATE TABLE IF NOT EXISTS sales_orders (
        id VARCHAR(64) PRIMARY KEY,
        company_id VARCHAR(64) NOT NULL,
        customer_id VARCHAR(64) NOT NULL,
        number VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        tax_rate_basis_points INTEGER NOT NULL DEFAULT 500,
        net_amount_minor_units BIGINT NOT NULL,
        tax_amount_minor_units BIGINT NOT NULL,
        total_amount_minor_units BIGINT NOT NULL,
        reservation_ids TEXT,
        memo VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, number)
      )`,
      `CREATE TABLE IF NOT EXISTS sales_order_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sales_order_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL,
        ordered_quantity BIGINT NOT NULL,
        shipped_quantity BIGINT NOT NULL DEFAULT 0,
        unit_price_minor_units BIGINT NOT NULL,
        line_total_minor_units BIGINT NOT NULL,
        currency VARCHAR(3) NOT NULL,
        CONSTRAINT fk_sales_order_lines_order FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS sales_shipments (
        id VARCHAR(64) PRIMARY KEY,
        sales_order_id VARCHAR(64) NOT NULL,
        company_id VARCHAR(64) NOT NULL,
        customer_id VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL,
        shipment_date VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'SHIPPED',
        ar_journal_entry_id VARCHAR(64),
        cogs_journal_entry_id VARCHAR(64),
        total_shipped_amount_minor_units BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS sales_shipment_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shipment_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL,
        shipped_quantity BIGINT NOT NULL,
        unit_price_minor_units BIGINT NOT NULL,
        line_total_minor_units BIGINT NOT NULL,
        CONSTRAINT fk_sales_shipment_lines_shipment FOREIGN KEY (shipment_id) REFERENCES sales_shipments(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS bank_accounts (
        id VARCHAR(64) PRIMARY KEY,
        companyId VARCHAR(64) NOT NULL,
        accountNumber VARCHAR(64) NOT NULL,
        bankCode VARCHAR(32) NOT NULL,
        bankName VARCHAR(255) NOT NULL,
        accountName VARCHAR(255) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'TWD',
        glAccountId VARCHAR(64) NOT NULL,
        currentBalanceMinorUnits VARCHAR(64) NOT NULL DEFAULT '0',
        isActive BOOLEAN NOT NULL DEFAULT true
      )`,
      `CREATE TABLE IF NOT EXISTS bank_statements (
        id VARCHAR(64) PRIMARY KEY,
        bankAccountId VARCHAR(64) NOT NULL,
        statementNumber VARCHAR(64) NOT NULL,
        statementDate VARCHAR(32) NOT NULL,
        openingBalanceMinorUnits VARCHAR(64) NOT NULL,
        closingBalanceMinorUnits VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS bank_statement_lines (
        id VARCHAR(64) PRIMARY KEY,
        bankStatementId VARCHAR(64) NOT NULL,
        transactionDate VARCHAR(32) NOT NULL,
        direction VARCHAR(16) NOT NULL,
        amountMinorUnits VARCHAR(64) NOT NULL,
        reference VARCHAR(128) NOT NULL,
        description TEXT,
        isMatched BOOLEAN NOT NULL DEFAULT false,
        matchedVoucherId VARCHAR(64),
        CONSTRAINT fk_bank_statement_lines_statement FOREIGN KEY (bankStatementId) REFERENCES bank_statements(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS payment_vouchers (
        id VARCHAR(64) PRIMARY KEY,
        companyId VARCHAR(64) NOT NULL,
        bankAccountId VARCHAR(64) NOT NULL,
        paymentNumber VARCHAR(64) NOT NULL,
        paymentDate VARCHAR(32) NOT NULL,
        beneficiaryType VARCHAR(32) NOT NULL,
        beneficiaryId VARCHAR(64) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'TWD',
        amountMinorUnits VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        journalEntryId VARCHAR(64),
        memo TEXT,
        postedAt TIMESTAMPTZ
      )`,
      `CREATE TABLE IF NOT EXISTS payment_voucher_lines (
        id VARCHAR(64) PRIMARY KEY,
        paymentVoucherId VARCHAR(64) NOT NULL,
        invoiceId VARCHAR(64) NOT NULL,
        appliedAmountMinorUnits VARCHAR(64) NOT NULL,
        memo TEXT,
        CONSTRAINT fk_payment_voucher_lines_voucher FOREIGN KEY (paymentVoucherId) REFERENCES payment_vouchers(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS receipt_vouchers (
        id VARCHAR(64) PRIMARY KEY,
        companyId VARCHAR(64) NOT NULL,
        bankAccountId VARCHAR(64) NOT NULL,
        receiptNumber VARCHAR(64) NOT NULL,
        receiptDate VARCHAR(32) NOT NULL,
        payerType VARCHAR(32) NOT NULL,
        payerId VARCHAR(64) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'TWD',
        amountMinorUnits VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        journalEntryId VARCHAR(64),
        memo TEXT,
        postedAt TIMESTAMPTZ
      )`,
      `CREATE TABLE IF NOT EXISTS receipt_voucher_lines (
        id VARCHAR(64) PRIMARY KEY,
        receiptVoucherId VARCHAR(64) NOT NULL,
        referenceId VARCHAR(64) NOT NULL,
        appliedAmountMinorUnits VARCHAR(64) NOT NULL,
        memo TEXT,
        CONSTRAINT fk_receipt_voucher_lines_voucher FOREIGN KEY (receiptVoucherId) REFERENCES receipt_vouchers(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS document_sequences (
        sequence_key VARCHAR(128) NOT NULL,
        period VARCHAR(32) NOT NULL DEFAULT '',
        current_seq BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (sequence_key, period)
      )`,
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES local_users(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id)',
      `CREATE TABLE IF NOT EXISTS outbox_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_name VARCHAR(160) NOT NULL,
        payload JSONB NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at TIMESTAMPTZ,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events (published_at, available_at)',
    ]

    for (const statement of statements) await queryRunner.query(statement)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'outbox_events',
      'auth_sessions',
      'document_sequences',
      'receipt_voucher_lines',
      'receipt_vouchers',
      'payment_voucher_lines',
      'payment_vouchers',
      'bank_statement_lines',
      'bank_statements',
      'bank_accounts',
      'sales_shipment_lines',
      'sales_shipments',
      'sales_order_lines',
      'sales_orders',
      'sales_customers',
      'procurement_vendor_invoice_lines',
      'procurement_vendor_invoices',
      'procurement_goods_receipt_lines',
      'goods_receipts',
      'procurement_purchase_requisition_lines',
      'procurement_purchase_requisitions',
      'purchase_order_lines',
      'purchase_orders',
      'suppliers',
      'work_order_lines',
      'work_orders',
      'bom_lines',
      'boms',
      'audit_entries',
      'journal_entry_lines',
      'journal_entries',
      'company_accounting_settings',
      'accounting_periods',
      'accounts',
      'inventory_stock_reservations',
      'inventory_movements',
      'inventory_warehouses',
      'inventory_items',
      'inventory_units',
      'user_roles',
      'user_organization_scopes',
      'role_permissions',
      'roles',
      'permissions',
      'local_users',
      'organization_units',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`)
    }
  }
}
