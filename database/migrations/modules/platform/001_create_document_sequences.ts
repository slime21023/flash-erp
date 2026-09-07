import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'document_sequences'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('sequence_key', 128).notNullable()
      table.string('period', 6).notNullable()
      table.bigInteger('last_value').notNullable()
      table.timestamp('updated_at').notNullable()
      table.primary(['sequence_key', 'period'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
