import type { MigrationInterface, QueryRunner } from 'typeorm'

export class PurchaseOrderApproval1710000005000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE purchase_orders ADD COLUMN approval_state JSONB')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE purchase_orders DROP COLUMN approval_state')
  }
}
