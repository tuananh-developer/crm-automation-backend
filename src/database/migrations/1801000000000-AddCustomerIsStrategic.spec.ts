import { AddCustomerIsStrategic1801000000000 } from './1801000000000-AddCustomerIsStrategic.js';

describe('AddCustomerIsStrategic1801000000000', () => {
  it('adds is_strategic column with default false and creates index on up', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const migration = new AddCustomerIsStrategic1801000000000();
    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "is_strategic" boolean NOT NULL DEFAULT false',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE INDEX IF NOT EXISTS "IDX_customers_is_strategic" ON "customers" ("is_strategic")',
      ),
    );
  });

  it('safely drops index and column on down rollback', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const migration = new AddCustomerIsStrategic1801000000000();
    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DROP INDEX IF EXISTS "IDX_customers_is_strategic"',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER TABLE "customers" DROP COLUMN IF EXISTS "is_strategic"',
      ),
    );
  });
});
