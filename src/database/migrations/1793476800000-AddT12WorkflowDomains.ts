import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddT12WorkflowDomains1793476800000 implements MigrationInterface {
  name = 'AddT12WorkflowDomains1793476800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(200)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_workflow_runs_idempotency_key" ON "workflow_runs" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(200)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notifications_idempotency_key" ON "notifications" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "next_best_action_recommendations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
      "entity_type" varchar(20) NOT NULL CHECK ("entity_type" IN ('Lead','Customer')), "entity_id" uuid NOT NULL,
      "recommendations" jsonb NOT NULL, "requires_human_approval" boolean NOT NULL DEFAULT false,
      "status" varchar(30) NOT NULL DEFAULT 'RECOMMENDED', "review_task_id" uuid NULL REFERENCES "review_tasks"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_nba_workflow_run" ON "next_best_action_recommendations"("workflow_run_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_nba_entity_created" ON "next_best_action_recommendations"("entity_type","entity_id","created_at")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "sales_meetings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workflow_run_id" uuid NOT NULL UNIQUE REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
      "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "lead_id" uuid NULL REFERENCES "leads"("id") ON DELETE SET NULL,
      "customer_id" uuid NULL REFERENCES "customers"("id") ON DELETE SET NULL, "attendee_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "meeting_purpose" varchar(500) NULL, "scheduled_at" timestamptz NULL, "source_type" varchar(40) NOT NULL DEFAULT 'MEETING_TRANSCRIPT',
      "status" varchar(30) NOT NULL DEFAULT 'PROCESSING', "transcript_id" uuid NULL, "summary_id" uuid NULL,
      "notification_sent_at" timestamptz NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CHECK (("lead_id" IS NULL) <> ("customer_id" IS NULL)))`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_meetings_owner_scheduled" ON "sales_meetings"("owner_id","scheduled_at")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "conversation_transcripts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "meeting_id" uuid NULL REFERENCES "sales_meetings"("id") ON DELETE SET NULL,
      "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE, "source_type" varchar(40) NOT NULL,
      "redacted_text" text NOT NULL, "redaction_mode" varchar(80) NOT NULL, "content_hash" varchar(64) NOT NULL,
      "idempotency_key" varchar(180) NOT NULL UNIQUE, "created_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_conversation_transcripts_meeting" ON "conversation_transcripts"("meeting_id","created_at")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "conversation_summaries" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "meeting_id" uuid NULL REFERENCES "sales_meetings"("id") ON DELETE SET NULL,
      "transcript_id" uuid NOT NULL REFERENCES "conversation_transcripts"("id") ON DELETE RESTRICT,
      "workflow_run_id" uuid NOT NULL UNIQUE REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
      "summary" text NOT NULL, "decisions" jsonb NOT NULL DEFAULT '[]'::jsonb, "risks" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_conversation_summaries_transcript" ON "conversation_summaries"("transcript_id")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "conversation_action_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "summary_id" uuid NOT NULL REFERENCES "conversation_summaries"("id") ON DELETE CASCADE,
      "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE, "title" varchar(200) NOT NULL,
      "description" text NULL, "owner_attendee_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      "due_date" timestamptz NULL, "evidence" text NULL, "confidence" numeric(5,4) NOT NULL DEFAULT 0,
      "requires_confirmation" boolean NOT NULL DEFAULT true, "status" varchar(30) NOT NULL DEFAULT 'PENDING_CONFIRMATION',
      "confirmed_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL, "confirmation_note" text NULL,
      "idempotency_key" varchar(200) NOT NULL UNIQUE, "created_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_conversation_action_items_summary" ON "conversation_action_items"("summary_id")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "product_catalog_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "sku" varchar(80) NOT NULL UNIQUE, "name" varchar(200) NOT NULL,
      "description" text NULL, "unit_price" numeric(14,2) NOT NULL CHECK ("unit_price" >= 0), "currency" varchar(3) NOT NULL,
      "tax_rate_percent" numeric(5,2) NOT NULL DEFAULT 0 CHECK ("tax_rate_percent" >= 0 AND "tax_rate_percent" <= 100),
      "is_active" boolean NOT NULL DEFAULT true, "created_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_catalog_items_active_currency" ON "product_catalog_items"("is_active","currency")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "quotes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workflow_run_id" uuid NOT NULL UNIQUE REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
      "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "customer_id" uuid NULL REFERENCES "customers"("id") ON DELETE SET NULL,
      "lead_id" uuid NULL REFERENCES "leads"("id") ON DELETE SET NULL, "title" varchar(200) NOT NULL,
      "executive_summary" text NULL, "body" text NULL, "currency" varchar(3) NOT NULL,
      "subtotal" numeric(14,2) NOT NULL, "discount_total" numeric(14,2) NOT NULL DEFAULT 0,
      "tax_total" numeric(14,2) NOT NULL, "total_amount" numeric(14,2) NOT NULL,
      "status" varchar(30) NOT NULL DEFAULT 'DRAFT', "approval_required" boolean NOT NULL DEFAULT true,
      "submitted_for_approval_at" timestamptz NULL, "approved_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      "approved_at" timestamptz NULL, "rejection_reason" text NULL, "pricing_snapshot" jsonb NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CHECK (("lead_id" IS NULL) <> ("customer_id" IS NULL)))`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quotes_customer_created" ON "quotes"("customer_id","created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quotes_lead_created" ON "quotes"("lead_id","created_at")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "quote_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "quote_id" uuid NOT NULL REFERENCES "quotes"("id") ON DELETE CASCADE,
      "catalog_item_id" uuid NULL REFERENCES "product_catalog_items"("id") ON DELETE SET NULL,
      "sku" varchar(80) NOT NULL, "name_snapshot" varchar(200) NOT NULL, "description_snapshot" text NULL,
      "quantity" integer NOT NULL CHECK ("quantity" > 0), "unit_price_snapshot" numeric(14,2) NOT NULL,
      "tax_rate_percent" numeric(5,2) NOT NULL, "line_subtotal" numeric(14,2) NOT NULL,
      "line_discount" numeric(14,2) NOT NULL, "line_tax" numeric(14,2) NOT NULL, "line_total" numeric(14,2) NOT NULL)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quote_items_quote" ON "quote_items"("quote_id")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "quote_approvals" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "quote_id" uuid NOT NULL UNIQUE REFERENCES "quotes"("id") ON DELETE CASCADE,
      "requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "reviewed_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      "status" varchar(20) NOT NULL DEFAULT 'PENDING', "decision_comment" text NULL,
      "idempotency_key" varchar(180) NOT NULL UNIQUE, "resolved_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now())`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "quote_approvals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quote_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_catalog_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_action_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_summaries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_transcripts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_meetings"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "next_best_action_recommendations"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_notifications_idempotency_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "idempotency_key"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_workflow_runs_idempotency_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_runs" DROP COLUMN IF EXISTS "idempotency_key"`,
    );
  }
}
