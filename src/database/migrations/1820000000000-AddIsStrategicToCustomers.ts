import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsStrategicToCustomers1820000000000 implements MigrationInterface {
  name = 'AddIsStrategicToCustomers1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "is_strategic" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN IF EXISTS "is_strategic"`,
    );
  }
}
