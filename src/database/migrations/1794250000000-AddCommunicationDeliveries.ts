import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunicationDeliveries1794250000000 implements MigrationInterface {
  name = 'AddCommunicationDeliveries1794250000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "communication_deliveries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "idempotency_key" varchar(200) NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "provider_message_id" varchar(255),
        "error" text,
        "retryable" boolean NOT NULL DEFAULT false,
        "simulated" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_communication_deliveries_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_communication_deliveries_idempotency_key"
      ON "communication_deliveries" ("idempotency_key")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "communication_deliveries"');
  }
}
