import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration for AI CRM Automation System.
 * Creates all tables according to ERD V3:
 *
 * Domain 1 — Identity & Access:   users
 * Domain 2 — Lead Management:     lead_sources, leads, interactions
 * Domain 3 — AI Lead Intelligence: lead_qualifications, lead_enrichments, lead_scores
 * Domain 4 — Follow-up Automation: follow_up_sequences, follow_up_steps,
 *                                   lead_follow_up_enrollments, follow_up_executions
 * Domain 5 — Customer Management: customers, segments, customer_segments
 * Domain 6 — Workflow & Governance: workflow_runs, review_tasks, notifications, audit_logs
 */
export class InitialSchema1727866977000 implements MigrationInterface {
  name = 'InitialSchema1727866977000';

  // ─────────────────────────────────────────────────────────────────────────
  // UP
  // ─────────────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. USERS ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"            VARCHAR(150)  NOT NULL,
        "email"           VARCHAR(320)  NOT NULL,
        "password_hash"   VARCHAR(255)  NOT NULL,
        "role"            VARCHAR(30)   NOT NULL DEFAULT 'SALES',
        "status"          VARCHAR(30)   NOT NULL DEFAULT 'ACTIVE',
        "last_login_at"   TIMESTAMPTZ,
        "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_users_email"  ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_role"   ON "users" ("role")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_status" ON "users" ("status")`,
    );

    // ── 2. LEAD_SOURCES ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "lead_sources" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"        VARCHAR(100)  NOT NULL,
        "description" TEXT,
        "is_active"   BOOLEAN       NOT NULL DEFAULT TRUE,
        "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_sources" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lead_sources_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_lead_sources_name" ON "lead_sources" ("name")`,
    );

    // ── 3. CUSTOMERS (created before LEADS to allow circular FK) ─────────────
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"             VARCHAR(200)  NOT NULL,
        "email"            VARCHAR(320)  NOT NULL,
        "phone"            VARCHAR(30),
        "company_name"     VARCHAR(255),
        "company_website"  VARCHAR(500),
        "job_title"        VARCHAR(150),
        "company_size"     INTEGER,
        "industry"         VARCHAR(150),
        "status"           VARCHAR(30),
        "created_by"       UUID          NOT NULL,
        "updated_by"       UUID,
        "notes"            TEXT,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_customers_updated_by" FOREIGN KEY ("updated_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_email"        ON "customers" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_status"       ON "customers" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_company_name" ON "customers" ("company_name")`,
    );

    // ── 4. LEADS ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "leads" (
        "id"                     UUID          NOT NULL DEFAULT gen_random_uuid(),
        "first_name"             VARCHAR(100)  NOT NULL,
        "last_name"              VARCHAR(100),
        "email"                  VARCHAR(320)  NOT NULL,
        "phone"                  VARCHAR(30),
        "company_name"           VARCHAR(255),
        "company_website"        VARCHAR(500),
        "job_title"              VARCHAR(150),
        "company_size"           INTEGER,
        "industry"               VARCHAR(150),
        "status"                 VARCHAR(30)   NOT NULL DEFAULT 'NEW',
        "source_id"              UUID          NOT NULL,
        "owner_id"               UUID,
        "converted_customer_id"  UUID,
        "converted_by"           UUID,
        "converted_at"           TIMESTAMPTZ,
        "notes"                  TEXT,
        "created_at"             TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leads" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leads_source_id" FOREIGN KEY ("source_id")
          REFERENCES "lead_sources" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_leads_owner_id" FOREIGN KEY ("owner_id")
          REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leads_converted_customer_id" FOREIGN KEY ("converted_customer_id")
          REFERENCES "customers" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leads_converted_by" FOREIGN KEY ("converted_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_email"      ON "leads" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_status"     ON "leads" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_source_id"  ON "leads" ("source_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_owner_id"   ON "leads" ("owner_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_created_at" ON "leads" ("created_at")`,
    );

    // ── 5. INTERACTIONS ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "interactions" (
        "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
        "lead_id"      UUID          NOT NULL,
        "type"         VARCHAR(50)   NOT NULL,
        "channel"      VARCHAR(50),
        "subject"      VARCHAR(255),
        "content"      TEXT,
        "metadata"     JSONB,
        "occurred_at"  TIMESTAMPTZ   NOT NULL,
        "created_by"   UUID,
        "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interactions_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interactions_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_interactions_lead_id_occurred_at" ON "interactions" ("lead_id", "occurred_at")`,
    );

    // ── 6. WORKFLOW_RUNS ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "workflow_runs" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "workflow_name"         VARCHAR(150)  NOT NULL,
        "n8n_execution_id"      VARCHAR(255)  UNIQUE,
        "lead_id"               UUID,
        "customer_id"           UUID,
        "triggered_by_user_id"  UUID,
        "status"                VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
        "input_payload"         JSONB,
        "output_payload"        JSONB,
        "error_message"         TEXT,
        "started_at"            TIMESTAMPTZ,
        "finished_at"           TIMESTAMPTZ,
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_runs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workflow_runs_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_workflow_runs_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_workflow_runs_triggered_by_user_id" FOREIGN KEY ("triggered_by_user_id")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_workflow_runs_n8n_execution_id" ON "workflow_runs" ("n8n_execution_id") WHERE "n8n_execution_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_runs_lead_id"     ON "workflow_runs" ("lead_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_runs_customer_id" ON "workflow_runs" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_runs_status"      ON "workflow_runs" ("status")`,
    );

    // ── 7. LEAD_QUALIFICATIONS ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "lead_qualifications" (
        "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
        "lead_id"          UUID           NOT NULL,
        "workflow_run_id"  UUID,
        "status"           VARCHAR(30)    NOT NULL,
        "intent"           VARCHAR(100),
        "confidence"       NUMERIC(5,4),
        "reason"           TEXT,
        "model_provider"   VARCHAR(100),
        "model_name"       VARCHAR(150),
        "model_version"    VARCHAR(100),
        "input_snapshot"   JSONB,
        "output_snapshot"  JSONB,
        "created_at"       TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_qualifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lead_qualifications_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lead_qualifications_workflow_run_id" FOREIGN KEY ("workflow_run_id")
          REFERENCES "workflow_runs" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_lead_qualifications_lead_id_created_at" ON "lead_qualifications" ("lead_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lead_qualifications_workflow_run_id" ON "lead_qualifications" ("workflow_run_id")`,
    );

    // ── 8. LEAD_ENRICHMENTS ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "lead_enrichments" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "lead_id"               UUID          NOT NULL,
        "workflow_run_id"       UUID,
        "provider"              VARCHAR(100)  NOT NULL,
        "external_request_id"   VARCHAR(255),
        "status"                VARCHAR(30)   NOT NULL,
        "company_name"          VARCHAR(255),
        "company_website"       VARCHAR(500),
        "company_industry"      VARCHAR(150),
        "company_size"          INTEGER,
        "contact_job_title"     VARCHAR(150),
        "contact_linkedin_url"  VARCHAR(500),
        "raw_response"          JSONB,
        "error_message"         TEXT,
        "enriched_at"           TIMESTAMPTZ   NOT NULL,
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_enrichments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lead_enrichments_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lead_enrichments_workflow_run_id" FOREIGN KEY ("workflow_run_id")
          REFERENCES "workflow_runs" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_lead_enrichments_lead_id_created_at" ON "lead_enrichments" ("lead_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lead_enrichments_workflow_run_id" ON "lead_enrichments" ("workflow_run_id")`,
    );

    // ── 9. LEAD_SCORES ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "lead_scores" (
        "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
        "lead_id"          UUID           NOT NULL,
        "workflow_run_id"  UUID,
        "score"            NUMERIC(5,2)   NOT NULL,
        "label"            VARCHAR(30)    NOT NULL,
        "reason"           TEXT,
        "model_provider"   VARCHAR(100),
        "model_name"       VARCHAR(150),
        "model_version"    VARCHAR(100),
        "scoring_features" JSONB,
        "input_snapshot"   JSONB,
        "output_snapshot"  JSONB,
        "created_at"       TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_scores" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lead_scores_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lead_scores_workflow_run_id" FOREIGN KEY ("workflow_run_id")
          REFERENCES "workflow_runs" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_lead_scores_lead_id_created_at" ON "lead_scores" ("lead_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lead_scores_workflow_run_id" ON "lead_scores" ("workflow_run_id")`,
    );

    // ── 10. FOLLOW_UP_SEQUENCES ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "follow_up_sequences" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"        VARCHAR(150)  NOT NULL,
        "description" TEXT,
        "status"      VARCHAR(30)   NOT NULL DEFAULT 'DRAFT',
        "created_by"  UUID          NOT NULL,
        "updated_by"  UUID,
        "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_follow_up_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_follow_up_sequences_name" UNIQUE ("name"),
        CONSTRAINT "FK_follow_up_sequences_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_follow_up_sequences_updated_by" FOREIGN KEY ("updated_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);

    // ── 11. FOLLOW_UP_STEPS ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "follow_up_steps" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "sequence_id"      UUID          NOT NULL,
        "step_order"       INTEGER       NOT NULL,
        "delay_minutes"    INTEGER       NOT NULL DEFAULT 0,
        "channel"          VARCHAR(50)   NOT NULL,
        "action_type"      VARCHAR(50)   NOT NULL,
        "subject_template" TEXT,
        "content_template" TEXT,
        "conditions"       JSONB,
        "metadata"         JSONB,
        "is_active"        BOOLEAN       NOT NULL DEFAULT TRUE,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_follow_up_steps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_follow_up_steps_sequence_step_order" UNIQUE ("sequence_id", "step_order"),
        CONSTRAINT "FK_follow_up_steps_sequence_id" FOREIGN KEY ("sequence_id")
          REFERENCES "follow_up_sequences" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_follow_up_steps_sequence_step_order" ON "follow_up_steps" ("sequence_id", "step_order")`,
    );

    // ── 12. LEAD_FOLLOW_UP_ENROLLMENTS ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "lead_follow_up_enrollments" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "lead_id"             UUID          NOT NULL,
        "sequence_id"         UUID          NOT NULL,
        "current_step_id"     UUID,
        "status"              VARCHAR(30)   NOT NULL DEFAULT 'ACTIVE',
        "started_at"          TIMESTAMPTZ,
        "paused_at"           TIMESTAMPTZ,
        "completed_at"        TIMESTAMPTZ,
        "cancelled_at"        TIMESTAMPTZ,
        "assigned_by"         UUID,
        "cancellation_reason" TEXT,
        "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_follow_up_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_enrollments_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_enrollments_sequence_id" FOREIGN KEY ("sequence_id")
          REFERENCES "follow_up_sequences" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_enrollments_current_step_id" FOREIGN KEY ("current_step_id")
          REFERENCES "follow_up_steps" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_enrollments_assigned_by" FOREIGN KEY ("assigned_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_enrollments_lead_id"     ON "lead_follow_up_enrollments" ("lead_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_enrollments_sequence_id" ON "lead_follow_up_enrollments" ("sequence_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_enrollments_status"      ON "lead_follow_up_enrollments" ("status")`,
    );

    // ── 13. FOLLOW_UP_EXECUTIONS ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "follow_up_executions" (
        "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        "enrollment_id"        UUID          NOT NULL,
        "step_id"              UUID          NOT NULL,
        "status"               VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
        "scheduled_at"         TIMESTAMPTZ,
        "started_at"           TIMESTAMPTZ,
        "completed_at"         TIMESTAMPTZ,
        "provider_message_id"  VARCHAR(255),
        "request_payload"      JSONB,
        "response_payload"     JSONB,
        "error_message"        TEXT,
        "retry_count"          INTEGER       NOT NULL DEFAULT 0,
        "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_follow_up_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_executions_enrollment_id" FOREIGN KEY ("enrollment_id")
          REFERENCES "lead_follow_up_enrollments" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_executions_step_id" FOREIGN KEY ("step_id")
          REFERENCES "follow_up_steps" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_executions_enrollment_id" ON "follow_up_executions" ("enrollment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_executions_step_id"       ON "follow_up_executions" ("step_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_executions_status"        ON "follow_up_executions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_executions_scheduled_at"  ON "follow_up_executions" ("scheduled_at")`,
    );

    // ── 14. SEGMENTS ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "segments" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"        VARCHAR(150)  NOT NULL,
        "description" TEXT,
        "criteria"    JSONB,
        "is_active"   BOOLEAN       NOT NULL DEFAULT TRUE,
        "created_by"  UUID          NOT NULL,
        "updated_by"  UUID,
        "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_segments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_segments_name" UNIQUE ("name"),
        CONSTRAINT "FK_segments_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_segments_updated_by" FOREIGN KEY ("updated_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_segments_name" ON "segments" ("name")`,
    );

    // ── 15. CUSTOMER_SEGMENTS ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "customer_segments" (
        "customer_id"      UUID          NOT NULL,
        "segment_id"       UUID          NOT NULL,
        "assignment_type"  VARCHAR(30)   NOT NULL,
        "confidence"       NUMERIC(5,4),
        "assigned_reason"  TEXT,
        "assigned_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "assigned_by"      UUID,
        CONSTRAINT "PK_customer_segments" PRIMARY KEY ("customer_id", "segment_id"),
        CONSTRAINT "FK_customer_segments_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_segments_segment_id" FOREIGN KEY ("segment_id")
          REFERENCES "segments" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_segments_assigned_by" FOREIGN KEY ("assigned_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_segments_assignment_type" ON "customer_segments" ("assignment_type")`,
    );

    // ── 16. REVIEW_TASKS ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "review_tasks" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "lead_id"          UUID          NOT NULL,
        "workflow_run_id"  UUID,
        "assigned_to"      UUID,
        "status"           VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
        "reason"           TEXT,
        "decision"         VARCHAR(30),
        "review_comment"   TEXT,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "started_at"       TIMESTAMPTZ,
        "resolved_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_review_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_review_tasks_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_tasks_workflow_run_id" FOREIGN KEY ("workflow_run_id")
          REFERENCES "workflow_runs" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_review_tasks_assigned_to" FOREIGN KEY ("assigned_to")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_review_tasks_lead_id"         ON "review_tasks" ("lead_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_tasks_workflow_run_id" ON "review_tasks" ("workflow_run_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_tasks_assigned_to"     ON "review_tasks" ("assigned_to")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_tasks_status"          ON "review_tasks" ("status")`,
    );

    // ── 17. NOTIFICATIONS ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"          UUID          NOT NULL,
        "type"             VARCHAR(50)   NOT NULL,
        "title"            VARCHAR(255)  NOT NULL,
        "content"          TEXT,
        "lead_id"          UUID,
        "customer_id"      UUID,
        "review_task_id"   UUID,
        "is_read"          BOOLEAN       NOT NULL DEFAULT FALSE,
        "read_at"          TIMESTAMPTZ,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notifications_lead_id" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_notifications_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_notifications_review_task_id" FOREIGN KEY ("review_task_id")
          REFERENCES "review_tasks" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_id"    ON "notifications" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_is_read"    ON "notifications" ("is_read")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_created_at" ON "notifications" ("created_at")`,
    );

    // ── 18. AUDIT_LOGS ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID,
        "action"      VARCHAR(100)  NOT NULL,
        "entity_type" VARCHAR(100)  NOT NULL,
        "entity_id"   UUID          NOT NULL,
        "old_value"   JSONB,
        "new_value"   JSONB,
        "metadata"    JSONB,
        "ip_address"  VARCHAR(45),
        "user_agent"  TEXT,
        "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity"     ON "audit_logs" ("entity_type", "entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_user_id"    ON "audit_logs" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action"     ON "audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOWN
  // ─────────────────────────────────────────────────────────────────────────

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    await queryRunner.query(
      `DROP TABLE IF EXISTS "audit_logs"                 CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notifications"              CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "review_tasks"               CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "customer_segments"          CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "segments"                   CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "follow_up_executions"       CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "lead_follow_up_enrollments" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "follow_up_steps"            CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "follow_up_sequences"        CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "lead_scores"                CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "lead_enrichments"           CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "lead_qualifications"        CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "workflow_runs"              CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "interactions"               CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "leads"                      CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "customers"                  CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "lead_sources"               CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "users"                      CASCADE`,
    );
  }
}
