/**
 * Fail-closed validation for production-only transport and persistence settings.
 * Development keeps its local Docker defaults; production must opt into encrypted
 * remote services and may not fall back to localhost credentials.
 */
type Environment = Record<string, unknown>;

function readString(environment: Environment, key: string): string {
  const value = environment[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isEnabled(value: unknown): boolean {
  return value === true ||
    (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

export function assertUrlUsesScheme(
  value: string,
  expectedScheme: 'https:' | 'amqps:',
  configKey: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(configKey + ' must be a valid absolute URL');
  }

  if (parsed.protocol !== expectedScheme) {
    throw new Error(
      configKey + ' must use ' + expectedScheme.slice(0, -1) + ' in production',
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(configKey + ' must not embed credentials in its URL');
  }
  if (parsed.hash) {
    throw new Error(configKey + ' must not contain a URL fragment');
  }
}

const PRODUCTION_N8N_URL_KEYS = [
  'N8N_BASE_URL',
  'N8N_WF10_WEBHOOK_URL',
  'N8N_WF11_WEBHOOK_URL',
  'N8N_WF12_WEBHOOK_URL',
  'N8N_WEBHOOK_BASE_URL',
] as const;

/**
 * Nest ConfigModule invokes this before constructing application providers.
 * Returning the original object preserves ConfigService's normal env behavior.
 */
export function validateEnvironmentConfiguration(
  environment: Environment,
): Environment {
  if (readString(environment, 'NODE_ENV').toLowerCase() !== 'production') {
    return environment;
  }

  const databaseUrl = readString(environment, 'DATABASE_URL');
  if (isEnabled(environment.USE_LOCAL_DB) || !databaseUrl) {
    throw new Error(
      'FATAL: DATABASE_URL is required in production and USE_LOCAL_DB must not be true',
    );
  }

  const rabbitmqUrl = readString(environment, 'RABBITMQ_URL');
  if (!rabbitmqUrl) {
    throw new Error('FATAL: RABBITMQ_URL is required in production');
  }
  assertUrlUsesScheme(rabbitmqUrl, 'amqps:', 'RABBITMQ_URL');

  for (const key of PRODUCTION_N8N_URL_KEYS) {
    const value = readString(environment, key);
    if (value) {
      assertUrlUsesScheme(value, 'https:', key);
    }
  }

  return environment;
}
