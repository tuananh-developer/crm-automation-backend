import { AddAccountHealthSnapshot1800000000000 } from './1800000000000-AddAccountHealthSnapshot.js';

describe('AddAccountHealthSnapshot1800000000000', () => {
  it('creates account_health_snapshots table and indexes on up', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const migration = new AddAccountHealthSnapshot1800000000000();
    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "account_health_snapshots"',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('IDX_account_health_snapshots_customer_id'),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('IDX_account_health_snapshots_assessed_at'),
    );
  });

  it('safely drops indexes and table on down rollback', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const migration = new AddAccountHealthSnapshot1800000000000();
    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DROP INDEX IF EXISTS "IDX_account_health_snapshots_assessed_at"',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DROP INDEX IF EXISTS "IDX_account_health_snapshots_customer_id"',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DROP TABLE IF EXISTS "account_health_snapshots"',
      ),
    );
  });
});
