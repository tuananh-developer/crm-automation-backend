import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxProcessingLease1793476900000 implements MigrationInterface {
  name = 'AddOutboxProcessingLease1793476900000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_until timestamptz');
    await queryRunner.query('ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS lock_token uuid');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS IDX_outbox_events_locked_until ON outbox_events (status, locked_until)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_outbox_events_locked_until');
    await queryRunner.query('ALTER TABLE outbox_events DROP COLUMN IF EXISTS lock_token');
    await queryRunner.query('ALTER TABLE outbox_events DROP COLUMN IF EXISTS locked_until');
  }
}
