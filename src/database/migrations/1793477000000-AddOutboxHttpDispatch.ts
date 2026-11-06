import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxHttpDispatch1793477000000 implements MigrationInterface {
  name = 'AddOutboxHttpDispatch1793477000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outbox_events"
       ADD COLUMN IF NOT EXISTS "transport" varchar(20) NOT NULL DEFAULT 'RABBITMQ',
       ADD COLUMN IF NOT EXISTS "destination" varchar(80),
       ADD COLUMN IF NOT EXISTS "destination_path" varchar(255)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_outbox_events_transport_status_created"
       ON "outbox_events" ("transport", "status", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_outbox_events_transport_status_created"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_events"
       DROP COLUMN IF EXISTS "destination_path",
       DROP COLUMN IF EXISTS "destination",
       DROP COLUMN IF EXISTS "transport"`,
    );
  }
}
