type SeedEnvironment = Record<string, string | undefined>;

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'postgres',
  'crm_postgres',
]);

function getDatabaseHost(environment: SeedEnvironment): string | undefined {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl) {
    try {
      return new URL(databaseUrl).hostname.toLowerCase();
    } catch {
      return 'invalid-database-url';
    }
  }

  return environment.DB_HOST?.toLowerCase();
}

export function assertSeedSafety(
  fresh: boolean,
  environment: SeedEnvironment = process.env,
): void {
  if (environment.NODE_ENV?.toLowerCase() === 'production') {
    throw new Error('Database seeding is disabled in production environments.');
  }

  const databaseHost = getDatabaseHost(environment);
  const isRemoteDatabase =
    databaseHost !== undefined && !LOCAL_DATABASE_HOSTS.has(databaseHost);

  if (isRemoteDatabase && environment.ALLOW_REMOTE_SEED !== 'true') {
    throw new Error(
      'Seeding a non-local database requires ALLOW_REMOTE_SEED=true.',
    );
  }

  if (
    fresh &&
    isRemoteDatabase &&
    environment.ALLOW_DESTRUCTIVE_SEED !== 'true'
  ) {
    throw new Error(
      'Fresh seeding a non-local database requires ALLOW_DESTRUCTIVE_SEED=true.',
    );
  }
}
