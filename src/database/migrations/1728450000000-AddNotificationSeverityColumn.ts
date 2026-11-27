import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSeverityColumn1728450000000 implements MigrationInterface {
  name = 'AddNotificationSeverityColumn1728450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN IF NOT EXISTS "severity" character varying(30) NOT NULL DEFAULT 'INFO'
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "severity" TYPE character varying(30),
      ALTER COLUMN "severity" SET DEFAULT 'INFO'
    `);
    await queryRunner.query(`
      UPDATE "notifications"
      SET "severity" = 'INFO'
      WHERE "severity" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "severity" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP COLUMN IF EXISTS "severity"
    `);
  }
}
