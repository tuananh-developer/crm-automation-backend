import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeedbackAndCustomerTasksTables1728600000000 implements MigrationInterface {
  name = 'CreateFeedbackAndCustomerTasksTables1728600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create customer_feedback table if not exists
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_feedback" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "source" character varying(50) NOT NULL DEFAULT 'WEB',
        "channel" character varying(50),
        "content" text NOT NULL,
        "content_redacted" text,
        "rating" numeric(3, 1),
        "sentiment" character varying(30),
        "category" character varying(100),
        "urgency" character varying(30),
        "status" character varying(30) NOT NULL DEFAULT 'NEW',
        "raw_ai_output" jsonb,
        "error_message" text,
        "workflow_run_id" uuid,
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_feedback_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_feedback_customer_id" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_customer_feedback_workflow_run_id" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_feedback_customer_id" ON "customer_feedback" ("customer_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_feedback_status" ON "customer_feedback" ("status");
    `);

    // 2. Canonical customer_tasks creation and reconciliation with PR #49 (AddCustomerChurnAssessmentAndCustomerTask)
    // Ensures whether PR #49 or PR #52 runs first, customer_tasks table exists and contains all required columns.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        CONSTRAINT "PK_customer_tasks_id" PRIMARY KEY ("id")
      );
    `);

    // Explicitly ALTER TABLE to ensure all required fields from both WF14 (PR #52) and Churn (PR #49) are present
    await queryRunner.query(`
      ALTER TABLE "customer_tasks"
        ADD COLUMN IF NOT EXISTS "assessment_id" uuid,
        ADD COLUMN IF NOT EXISTS "churn_assessment_id" uuid,
        ADD COLUMN IF NOT EXISTS "customer_feedback_id" uuid,
        ADD COLUMN IF NOT EXISTS "customer_issue_id" uuid,
        ADD COLUMN IF NOT EXISTS "health_assessment_id" uuid,
        ADD COLUMN IF NOT EXISTS "workflow_run_id" uuid,
        ADD COLUMN IF NOT EXISTS "task_type" character varying(50) NOT NULL DEFAULT 'RETENTION',
        ADD COLUMN IF NOT EXISTS "title" character varying(255) NOT NULL DEFAULT 'Customer Task',
        ADD COLUMN IF NOT EXISTS "description" text,
        ADD COLUMN IF NOT EXISTS "notes" text,
        ADD COLUMN IF NOT EXISTS "priority" character varying(30) NOT NULL DEFAULT 'MEDIUM',
        ADD COLUMN IF NOT EXISTS "status" character varying(30) NOT NULL DEFAULT 'OPEN',
        ADD COLUMN IF NOT EXISTS "assigned_to" uuid,
        ADD COLUMN IF NOT EXISTS "created_by" uuid,
        ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "idempotency_key" character varying(255),
        ADD COLUMN IF NOT EXISTS "source_entity_type" character varying(50),
        ADD COLUMN IF NOT EXISTS "source_entity_id" uuid,
        ADD COLUMN IF NOT EXISTS "metadata" jsonb,
        ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
    `);

    // Add unique index on idempotency_key safely
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_tasks_idempotency_key" ON "customer_tasks" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_tasks_customer_id" ON "customer_tasks" ("customer_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_tasks_status" ON "customer_tasks" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_tasks_assessment_id" ON "customer_tasks" ("assessment_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_tasks_feedback_id" ON "customer_tasks" ("customer_feedback_id");
    `);

    // Safely add foreign key constraints if they do not exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_customer_id') THEN
          ALTER TABLE "customer_tasks" ADD CONSTRAINT "FK_customer_tasks_customer_id" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_assigned_to') THEN
          ALTER TABLE "customer_tasks" ADD CONSTRAINT "FK_customer_tasks_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_created_by') THEN
          ALTER TABLE "customer_tasks" ADD CONSTRAINT "FK_customer_tasks_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_customer_feedback_id') THEN
          ALTER TABLE "customer_tasks" ADD CONSTRAINT "FK_customer_tasks_customer_feedback_id" FOREIGN KEY ("customer_feedback_id") REFERENCES "customer_feedback"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_workflow_run_id') THEN
          ALTER TABLE "customer_tasks" ADD CONSTRAINT "FK_customer_tasks_workflow_run_id" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // 3. Add severity column to notifications if not exists
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN IF NOT EXISTS "severity" character varying(30) DEFAULT 'INFO';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Revert WF14-specific relations, constraints, and data from shared customer_tasks table
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_tasks') THEN
          -- Drop foreign key constraint referencing customer_feedback
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customer_tasks_customer_feedback_id') THEN
            ALTER TABLE "customer_tasks" DROP CONSTRAINT "FK_customer_tasks_customer_feedback_id";
          END IF;

          -- Drop index on customer_feedback_id
          DROP INDEX IF EXISTS "idx_customer_tasks_feedback_id";

          -- Clean up tasks specifically originating from customer feedback
          DELETE FROM "customer_tasks" WHERE "customer_feedback_id" IS NOT NULL;

          -- Drop feedback column from shared table
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_tasks' AND column_name = 'customer_feedback_id') THEN
            ALTER TABLE "customer_tasks" DROP COLUMN "customer_feedback_id";
          END IF;
        END IF;
      END $$;
    `);

    // 2. Safely drop customer_feedback table exclusively owned by WF14
    await queryRunner.query(`
      DROP TABLE IF EXISTS "customer_feedback" CASCADE;
    `);

    // 3. Do NOT drop shared customer_tasks table or notifications.severity column.
    // customer_tasks is a shared operational table (used by PR #49 Churn Assessment and other workflows),
    // and may exist before WF14 even when empty. Only WF14-owned columns/constraints/indexes are removed above.
  }
}
