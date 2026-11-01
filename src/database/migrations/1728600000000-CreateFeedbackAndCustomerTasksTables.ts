import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeedbackAndCustomerTasksTables1728600000000 implements MigrationInterface {
  name = 'CreateFeedbackAndCustomerTasksTables1728600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "assessment_id" uuid,
        "churn_assessment_id" uuid,
        "customer_feedback_id" uuid,
        "customer_issue_id" uuid,
        "health_assessment_id" uuid,
        "workflow_run_id" uuid,
        "task_type" character varying(50) NOT NULL DEFAULT 'RETENTION',
        "title" character varying(255) NOT NULL DEFAULT 'Customer Task',
        "description" text,
        "notes" text,
        "priority" character varying(30) NOT NULL DEFAULT 'MEDIUM',
        "status" character varying(30) NOT NULL DEFAULT 'OPEN',
        "assigned_to" uuid,
        "created_by" uuid,
        "due_at" TIMESTAMP WITH TIME ZONE,
        "idempotency_key" character varying(255) NOT NULL,
        "source_entity_type" character varying(50),
        "source_entity_id" uuid,
        "metadata" jsonb,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_tasks_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_tasks_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_customer_tasks_customer_id" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_customer_tasks_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_customer_tasks_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_customer_tasks_customer_feedback_id" FOREIGN KEY ("customer_feedback_id") REFERENCES "customer_feedback"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_customer_tasks_workflow_run_id" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      );
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "customer_tasks";
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "customer_feedback";
    `);
  }
}
