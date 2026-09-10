import type { MigrationInterface, QueryRunner } from 'typeorm'

const timestampColumns = [
  ['organization_units', 'created_at'],
  ['organization_units', 'updated_at'],
  ['local_users', 'created_at'],
  ['local_users', 'updated_at'],
  ['permissions', 'created_at'],
  ['permissions', 'updated_at'],
  ['roles', 'created_at'],
  ['roles', 'updated_at'],
  ['role_permissions', 'created_at'],
  ['user_organization_scopes', 'created_at'],
  ['user_roles', 'created_at'],
  ['document_sequences', 'updated_at'],
] as const

export class HardenSchemaDefaults1710000002000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of timestampColumns) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT CURRENT_TIMESTAMP`
      )
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of timestampColumns) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`)
    }
  }
}
