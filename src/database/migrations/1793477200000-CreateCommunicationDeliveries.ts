import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommunicationDeliveries1793477200000
  implements MigrationInterface
{
  name = 'CreateCommunicationDeliveries1793477200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "communication_deliveries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "execution_id" uuid NOT NULL,
        "idempotency_key" varchar(180) NOT NULL,
        "request_hash" varchar(64) NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'PROCESSING',
        "attempts" integer NOT NULL DEFAULT 1,
        "provider_message_id" varchar(255),
        "last_error" varchar(500),
        "started_at" timestamptz NOT NULL,
        "sent_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_communication_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_communication_deliveries_execution"
          FOREIGN KEY ("execution_id")
          REFERENCES "follow_up_executions"("id")
          ON DELETE CASCADE,
        CONSTRAINT "CHK_communication_deliveries_status"
          CHECK ("status" IN ('PROCESSING', 'SENT', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN')),
        CONSTRAINT "CHK_communication_deliveries_attempts"
          CHECK ("attempts" >= 1)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_communication_deliveries_execution_id"
      ON "communication_deliveries" ("execution_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_communication_deliveries_idempotency_key"
      ON "communication_deliveries" ("idempotency_key")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_communication_deliveries_status_started_at"
      ON "communication_deliveries" ("status", "started_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "communication_deliveries"');
  }
}
