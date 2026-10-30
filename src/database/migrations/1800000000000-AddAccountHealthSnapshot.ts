import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountHealthSnapshot1800000000000 implements MigrationInterface {
  name = 'AddAccountHealthSnapshot1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account_health_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "score" integer NOT NULL,
        "status" varchar(30) NOT NULL,
        "breakdown" jsonb,
        "evidence" jsonb,
        "missing_data" jsonb,
        "data_coverage" jsonb,
        "assessed_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_account_health_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_account_health_snapshots_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_account_health_snapshots_customer_id" ON "account_health_snapshots" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_account_health_snapshots_assessed_at" ON "account_health_snapshots" ("assessed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_account_health_snapshots_assessed_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_account_health_snapshots_customer_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "account_health_snapshots"`);
  }
}
