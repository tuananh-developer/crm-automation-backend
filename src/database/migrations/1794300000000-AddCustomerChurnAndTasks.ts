import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerChurnAndTasks1794300000000 implements MigrationInterface {
  name = 'AddCustomerChurnAndTasks1794300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_churn_assessments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "score" integer,
        "risk_level" varchar(40) NOT NULL,
        "as_of_date" date,
        "policy_version" varchar(40) NOT NULL DEFAULT 'v1',
        "evidence" jsonb,
        "coverage" jsonb,
        "workflow_run_id" uuid,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "assessed_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_customer_churn_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_churn_assessments_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_churn_assessments_workflow_run"
          FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_customer_churn_assessments_customer_as_of_date"
      ON "customer_churn_assessments" ("customer_id", "as_of_date")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_churn_assessments_customer_id"
      ON "customer_churn_assessments" ("customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_churn_assessments_assessed_at"
      ON "customer_churn_assessments" ("assessed_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_churn_assessments_risk_level"
      ON "customer_churn_assessments" ("risk_level")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "assessment_id" uuid,
        "task_type" varchar(50) NOT NULL DEFAULT 'RETENTION',
        "status" varchar(30) NOT NULL DEFAULT 'OPEN',
        "priority" varchar(30) NOT NULL DEFAULT 'HIGH',
        "idempotency_key" varchar(255) NOT NULL,
        "due_at" timestamptz,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "PK_customer_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_tasks_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_tasks"
        ADD COLUMN IF NOT EXISTS "assessment_id" uuid,
        ADD COLUMN IF NOT EXISTS "churn_assessment_id" uuid,
        ADD COLUMN IF NOT EXISTS "customer_feedback_id" uuid,
        ADD COLUMN IF NOT EXISTS "customer_issue_id" uuid,
        ADD COLUMN IF NOT EXISTS "health_assessment_id" uuid,
        ADD COLUMN IF NOT EXISTS "workflow_run_id" uuid,
        ADD COLUMN IF NOT EXISTS "task_type" varchar(50) NOT NULL DEFAULT 'RETENTION',
        ADD COLUMN IF NOT EXISTS "title" varchar(255) NOT NULL DEFAULT 'Customer Task',
        ADD COLUMN IF NOT EXISTS "description" text,
        ADD COLUMN IF NOT EXISTS "notes" text,
        ADD COLUMN IF NOT EXISTS "priority" varchar(30) NOT NULL DEFAULT 'HIGH',
        ADD COLUMN IF NOT EXISTS "status" varchar(30) NOT NULL DEFAULT 'OPEN',
        ADD COLUMN IF NOT EXISTS "assigned_to" uuid,
        ADD COLUMN IF NOT EXISTS "created_by" uuid,
        ADD COLUMN IF NOT EXISTS "due_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(255),
        ADD COLUMN IF NOT EXISTS "source_entity_type" varchar(50),
        ADD COLUMN IF NOT EXISTS "source_entity_id" uuid,
        ADD COLUMN IF NOT EXISTS "metadata" jsonb,
        ADD COLUMN IF NOT EXISTS "completed_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_tasks_idempotency_key"
      ON "customer_tasks" ("idempotency_key")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_tasks_customer_id"
      ON "customer_tasks" ("customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_tasks_assessment_id"
      ON "customer_tasks" ("assessment_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_tasks_status"
      ON "customer_tasks" ("status")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_assessment') THEN
          ALTER TABLE "customer_tasks"
            ADD CONSTRAINT "FK_customer_tasks_assessment"
            FOREIGN KEY ("assessment_id") REFERENCES "customer_churn_assessments"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_tasks') THEN
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_assessment') THEN
            ALTER TABLE "customer_tasks" DROP CONSTRAINT "FK_customer_tasks_assessment";
          END IF;
          DELETE FROM "customer_tasks" WHERE "assessment_id" IS NOT NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      'DROP TABLE IF EXISTS "customer_churn_assessments"',
    );
  }
}
