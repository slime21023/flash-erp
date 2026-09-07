import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('accounts', (table) => {
      table.string('id', 64).primary()
      table
        .string('company_id', 64)
        .notNullable()
        .references('id')
        .inTable('organization_units')
        .onDelete('RESTRICT')
      table.string('code', 32).notNullable()
      table.string('name', 160).notNullable()
      table.string('normal_balance', 6).notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.unique(['company_id', 'code'])
      table.check("normal_balance IN ('DEBIT', 'CREDIT')")
    })
  }

  async down() {
    this.schema.dropTable('accounts')
  }
}
