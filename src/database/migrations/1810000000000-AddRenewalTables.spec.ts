import { AddRenewalTables1810000000000 } from './1810000000000-AddRenewalTables.js';

describe('AddRenewalTables1810000000000 Migration', () => {
  it('creates contracts and renewal_drafts tables with foreign keys and indexes', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddRenewalTables1810000000000().up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "contracts"'),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('REFERENCES "customers"("id") ON DELETE CASCADE'),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE INDEX IF NOT EXISTS "IDX_contracts_renewal_date"',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "renewal_drafts"'),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CONSTRAINT "UQ_renewal_drafts_idempotency_key" UNIQUE ("idempotency_key")',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('REFERENCES "contracts"("id") ON DELETE CASCADE'),
    );
  });

  it('safely drops renewal_drafts and contracts on rollback in reverse dependency order', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddRenewalTables1810000000000().down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'DROP TABLE IF EXISTS "renewal_drafts"',
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'DROP TABLE IF EXISTS "contracts"',
    );
  });
});
