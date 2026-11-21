import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the is_strategic flag to customers so WF15 can filter strategic
 * accounts. Safe to run on existing databases: the column defaults to false
 * and existing rows are unaffected.
 */
export class AddCustomerIsStrategic1801000000000 implements MigrationInterface {
  name = 'AddCustomerIsStrategic1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "is_strategic" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customers_is_strategic" ON "customers" ("is_strategic")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customers_is_strategic"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN IF EXISTS "is_strategic"`,
    );
  }
}
