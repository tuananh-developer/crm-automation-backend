import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerChurnAssessmentAndCustomerTask1760000000000 implements MigrationInterface {
  name = 'AddCustomerChurnAssessmentAndCustomerTask1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customer_churn_assessments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "score" integer,
        "risk_level" character varying(40) NOT NULL,
        "as_of_date" date,
        "policy_version" character varying(40) NOT NULL DEFAULT 'v1',
        "evidence" jsonb,
        "coverage" jsonb,
        "workflow_run_id" uuid,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "assessed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_churn_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_churn_assessments_customer" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_customer_churn_assessments_customer_as_of_date" UNIQUE ("customer_id", "as_of_date")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "customer_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "assessment_id" uuid,
        "task_type" character varying(40) NOT NULL DEFAULT 'RETENTION',
        "status" character varying(30) NOT NULL DEFAULT 'OPEN',
        "priority" character varying(20) NOT NULL DEFAULT 'HIGH',
        "idempotency_key" character varying(255) NOT NULL,
        "due_at" TIMESTAMPTZ,
        "notes" text,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_customer_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_tasks_customer" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_tasks_assessment" FOREIGN KEY ("assessment_id") REFERENCES "customer_churn_assessments" ("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_customer_tasks_idempotency_key" UNIQUE ("idempotency_key")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_customer_churn_assessments_customer_id" ON "customer_churn_assessments" ("customer_id");
      CREATE INDEX "IDX_customer_churn_assessments_assessed_at" ON "customer_churn_assessments" ("assessed_at");
      CREATE INDEX "IDX_customer_churn_assessments_risk_level" ON "customer_churn_assessments" ("risk_level");
      CREATE INDEX "IDX_customer_tasks_customer_id" ON "customer_tasks" ("customer_id");
      CREATE INDEX "IDX_customer_tasks_assessment_id" ON "customer_tasks" ("assessment_id");
      CREATE INDEX "IDX_customer_tasks_status" ON "customer_tasks" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_tasks" CASCADE;`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "customer_churn_assessments" CASCADE;`,
    );
  }
}
