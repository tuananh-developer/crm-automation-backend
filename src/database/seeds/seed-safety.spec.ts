import { assertSeedSafety } from './seed-safety.js';

describe('assertSeedSafety', () => {
  it('refuses all seeding in production', () => {
    expect(() =>
      assertSeedSafety(false, {
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
      }),
    ).toThrow('Database seeding is disabled in production environments.');
  });

  it('allows a non-destructive local seed without remote opt-ins', () => {
    expect(() =>
      assertSeedSafety(false, {
        NODE_ENV: 'development',
        DB_HOST: 'localhost',
      }),
    ).not.toThrow();
  });

  it('requires an explicit opt-in before seeding a remote database', () => {
    expect(() =>
      assertSeedSafety(false, {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://example.invalid/crm',
      }),
    ).toThrow('Seeding a non-local database requires ALLOW_REMOTE_SEED=true.');
  });

  it('requires a second explicit opt-in before fresh seeding a remote database', () => {
    const environment = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://example.invalid/crm',
      ALLOW_REMOTE_SEED: 'true',
    };

    expect(() => assertSeedSafety(true, environment)).toThrow(
      'Fresh seeding a non-local database requires ALLOW_DESTRUCTIVE_SEED=true.',
    );
    expect(() =>
      assertSeedSafety(true, {
        ...environment,
        ALLOW_DESTRUCTIVE_SEED: 'true',
      }),
    ).not.toThrow();
  });

  it('fails closed for malformed remote database URLs', () => {
    expect(() =>
      assertSeedSafety(false, {
        NODE_ENV: 'development',
        DATABASE_URL: 'not-a-valid-url',
      }),
    ).toThrow('Seeding a non-local database requires ALLOW_REMOTE_SEED=true.');
  });
});
