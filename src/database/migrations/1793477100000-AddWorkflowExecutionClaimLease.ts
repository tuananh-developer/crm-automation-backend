import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowExecutionClaimLease1793477100000 implements MigrationInterface {
  name = 'AddWorkflowExecutionClaimLease1793477100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamptz',
    );

    // Give executions that were already RUNNING before this migration a
    // deployment grace period instead of making them immediately recoverable.
    // The grace period matches the maximum configured lease and prevents a
    // recovery execution from racing an in-flight legacy execution immediately
    // after the schema change.
    await queryRunner.query(
      "UPDATE \"workflow_runs\" SET \"claim_expires_at\" = NOW() + INTERVAL '1 hour' WHERE \"n8n_execution_id\" IS NOT NULL AND \"status\" = 'RUNNING' AND \"claim_expires_at\" IS NULL",
    );

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_workflow_runs_claim_expires_at" ON "workflow_runs" ("status", "claim_expires_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_workflow_runs_claim_expires_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "workflow_runs" DROP COLUMN IF EXISTS "claim_expires_at"',
    );
  }
}
