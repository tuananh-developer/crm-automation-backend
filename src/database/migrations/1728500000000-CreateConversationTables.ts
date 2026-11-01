import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversationTables1728500000000 implements MigrationInterface {
  name = 'CreateConversationTables1728500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_transcripts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "meeting_id" UUID,
        "customer_id" UUID,
        "lead_id" UUID,
        "source_type" VARCHAR(50) NOT NULL DEFAULT 'CALL',
        "redacted_content" TEXT NOT NULL,
        "processing_status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        "created_by" UUID,
        "workflow_run_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_transcripts_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_transcripts_lead" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_transcripts_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_transcripts_workflow_run" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS "idx_transcripts_customer_id" ON "conversation_transcripts" ("customer_id");
      CREATE INDEX IF NOT EXISTS "idx_transcripts_lead_id" ON "conversation_transcripts" ("lead_id");
      CREATE INDEX IF NOT EXISTS "idx_transcripts_status" ON "conversation_transcripts" ("processing_status");

      CREATE TABLE IF NOT EXISTS "conversation_summaries" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "transcript_id" UUID NOT NULL,
        "summary_text" TEXT NOT NULL,
        "sentiment" VARCHAR(30),
        "intent" VARCHAR(100),
        "key_points" JSONB,
        "raw_ai_output" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_summaries_transcript" FOREIGN KEY ("transcript_id") REFERENCES "conversation_transcripts"("id") ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "idx_summaries_transcript_id" ON "conversation_summaries" ("transcript_id");

      CREATE TABLE IF NOT EXISTS "conversation_action_items" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "summary_id" UUID NOT NULL,
        "title" VARCHAR(255) NOT NULL,
        "assigned_to" UUID,
        "due_at" TIMESTAMPTZ,
        "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        "approval_state" VARCHAR(30) NOT NULL DEFAULT 'PROPOSED',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_action_items_summary" FOREIGN KEY ("summary_id") REFERENCES "conversation_summaries"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_action_items_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS "idx_action_items_summary_id" ON "conversation_action_items" ("summary_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "conversation_action_items";
      DROP TABLE IF EXISTS "conversation_summaries";
      DROP TABLE IF EXISTS "conversation_transcripts";
    `);
  }
}
