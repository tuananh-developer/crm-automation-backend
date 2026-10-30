import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRenewalTables1810000000000 implements MigrationInterface {
  name = 'AddRenewalTables1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contracts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "contract_number" varchar(100) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "start_date" timestamptz NOT NULL,
        "end_date" timestamptz NOT NULL,
        "renewal_date" timestamptz,
        "amount" numeric(12,2),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contracts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contracts_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contracts_customer_id" ON "contracts" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contracts_status" ON "contracts" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contracts_renewal_date" ON "contracts" ("renewal_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "renewal_drafts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contract_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "renewal_date" timestamptz,
        "urgency" varchar(20),
        "recommendation" text,
        "draft_content" text,
        "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
        "idempotency_key" varchar(255) NOT NULL,
        "ai_model" varchar(100),
        "validation_result" jsonb,
        "error_code" varchar(50),
        "error_message" text,
        "workflow_execution_id" varchar(100),
        "communication_id" varchar(100),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_renewal_drafts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_renewal_drafts_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_renewal_drafts_contract" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_renewal_drafts_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_renewal_drafts_contract_id" ON "renewal_drafts" ("contract_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_renewal_drafts_customer_id" ON "renewal_drafts" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_renewal_drafts_status" ON "renewal_drafts" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "renewal_drafts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contracts"`);
  }
}
