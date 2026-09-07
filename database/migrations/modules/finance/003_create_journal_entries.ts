import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('journal_entries', (table) => {
      table.string('id', 64).primary()
      table
        .string('company_id', 64)
        .notNullable()
        .references('id')
        .inTable('organization_units')
        .onDelete('RESTRICT')
      table.string('number', 64).notNullable()
      table.date('accounting_date').notNullable()
      table.string('status', 12).notNullable().defaultTo('DRAFT')
      table.string('currency', 3).notNullable()
      table.bigInteger('total_debit_minor_units').notNullable()
      table.bigInteger('total_credit_minor_units').notNullable()
      table.timestamp('posted_at').nullable()
      table.unique(['company_id', 'number'])
      table.check("status IN ('DRAFT', 'POSTED', 'VOID')")
      table.check("currency ~ '^[A-Z]{3}$'")
    })
  }

  async down() {
    this.schema.dropTable('journal_entries')
  }
}
