import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('journal_entry_lines', (table) => {
      table.bigIncrements('id').primary()
      table
        .string('journal_entry_id', 64)
        .notNullable()
        .references('id')
        .inTable('journal_entries')
        .onDelete('RESTRICT')
      table
        .string('account_id', 64)
        .notNullable()
        .references('id')
        .inTable('accounts')
        .onDelete('RESTRICT')
      table.bigInteger('debit_minor_units').notNullable()
      table.bigInteger('credit_minor_units').notNullable()
      table.integer('line_number').notNullable()
      table.unique(['journal_entry_id', 'line_number'])
      table.check('debit_minor_units >= 0')
      table.check('credit_minor_units >= 0')
      table.check('(debit_minor_units = 0) <> (credit_minor_units = 0)')
    })
  }

  async down() {
    this.schema.dropTable('journal_entry_lines')
  }
}
