import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnrollmentActiveUniqueIndex1728400000000 implements MigrationInterface {
  name = 'AddEnrollmentActiveUniqueIndex1728400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_enrollments_lead_sequence_active"
      ON "lead_follow_up_enrollments" ("lead_id", "sequence_id")
      WHERE ("status" = 'ACTIVE');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_enrollments_lead_sequence_active";
    `);
  }
}
