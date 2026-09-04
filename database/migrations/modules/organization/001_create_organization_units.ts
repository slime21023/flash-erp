import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'organization_units'

  async up() {
    await this.schema.createTable(this.tableName, (table) => {
      table.string('id', 64).primary()
      table.string('code', 64).notNullable().unique()
      table.string('name', 160).notNullable()
      table
        .enu('kind', ['COMPANY', 'PLANT', 'WAREHOUSE'], {
          useNative: true,
          enumName: 'organization_unit_kind',
        })
        .notNullable()
      table.string('parent_id', 64).nullable()
      table.foreign('parent_id').references('id').inTable(this.tableName).onDelete('RESTRICT')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['parent_id'])
      table.index(['kind'])
    })
  }

  async down() {
    await this.schema.dropTable(this.tableName)
    await this.schema.raw('DROP TYPE IF EXISTS organization_unit_kind')
  }
}
