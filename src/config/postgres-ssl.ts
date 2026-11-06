import { readFileSync } from 'node:fs';

export interface PostgresConnectionOptions {
  url: string;
  ssl:
    | false
    | {
        rejectUnauthorized: true;
        ca?: string;
        cert?: string;
        key?: string;
      };
}

interface PostgresSslConfigInput {
  forceSsl?: boolean;
  ca?: string;
}

const SSL_QUERY_PARAMETERS = [
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
] as const;

const SUPPORTED_SSL_MODES = [
  'disable',
  'no-verify',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
] as const;

function readCertificateFile(path: string, parameter: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      'Unable to read the ' +
        parameter +
        ' certificate file configured in DATABASE_URL',
    );
  }
}

/**
 * Extract PostgreSQL SSL query parameters before passing the URL to node-postgres.
 * node-postgres otherwise replaces the explicit SSL object with settings parsed
 * from the URL, which can silently discard DB_SSL_CA and rejectUnauthorized.
 *
 * URL SSL modes are treated as a request to use TLS, not as permission to weaken
 * certificate verification. Whenever TLS is enabled, certificate-chain and
 * hostname verification remain enabled.
 */
export function resolvePostgresConnectionOptions(
  databaseUrl: string,
  config: PostgresSslConfigInput = {},
): PostgresConnectionOptions {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (
    parsedUrl.protocol !== 'postgres:' &&
    parsedUrl.protocol !== 'postgresql:'
  ) {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme');
  }

  const sslMode = parsedUrl.searchParams.get('sslmode')?.toLowerCase() ?? null;
  const sslFlag = parsedUrl.searchParams.get('ssl')?.toLowerCase() ?? null;
  const caPath = parsedUrl.searchParams.get('sslrootcert');
  const certPath = parsedUrl.searchParams.get('sslcert');
  const keyPath = parsedUrl.searchParams.get('sslkey');

  if (
    sslMode !== null &&
    !SUPPORTED_SSL_MODES.includes(
      sslMode as (typeof SUPPORTED_SSL_MODES)[number],
    )
  ) {
    throw new Error('DATABASE_URL contains an unsupported sslmode value');
  }

  if (
    sslFlag !== null &&
    !['1', 'true', '0', 'false'].includes(sslFlag)
  ) {
    throw new Error('DATABASE_URL contains an invalid ssl value');
  }

  if (Boolean(certPath) !== Boolean(keyPath)) {
    throw new Error(
      'DATABASE_URL must provide both sslcert and sslkey for client-certificate authentication',
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const managedDatabaseHost =
    hostname.includes('neon.tech') ||
    hostname.includes('supabase') ||
    hostname.endsWith('.render.com');

  const urlRequestsSsl =
    (sslMode !== null && sslMode !== 'disable') ||
    sslFlag === '1' ||
    sslFlag === 'true' ||
    Boolean(caPath || certPath || keyPath);

  const useSsl =
    config.forceSsl === true ||
    Boolean(config.ca) ||
    managedDatabaseHost ||
    urlRequestsSsl;

  const ca =
    config.ca ??
    (caPath ? readCertificateFile(caPath, 'sslrootcert') : undefined);
  const cert = certPath ? readCertificateFile(certPath, 'sslcert') : undefined;
  const key = keyPath ? readCertificateFile(keyPath, 'sslkey') : undefined;

  for (const parameter of SSL_QUERY_PARAMETERS) {
    parsedUrl.searchParams.delete(parameter);
  }

  return {
    url: parsedUrl.toString(),
    ssl: useSsl
      ? {
          rejectUnauthorized: true,
          ...(ca ? { ca } : {}),
          ...(cert ? { cert } : {}),
          ...(key ? { key } : {}),
        }
      : false,
  };
}
