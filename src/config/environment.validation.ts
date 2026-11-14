/**
 * Fail-closed validation for production persistence and transport settings.
 *
 * Production uses managed PostgreSQL by default. A single-EC2 deployment may
 * explicitly opt into private local services independently (for example,
 * Neon PostgreSQL + Docker-private RabbitMQ) with
 * ALLOW_LOCAL_INFRA_IN_PRODUCTION=true. Local services must use Compose DNS
 * names, strong credentials, and must never publish their ports to the host.
 */
type Environment = Record<string, unknown>;

function readString(environment: Environment, key: string): string {
  const value = environment[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isEnabled(value: unknown): boolean {
  return (
    value === true ||
    (typeof value === 'string' && value.trim().toLowerCase() === 'true')
  );
}

function assertRequiredSecret(
  environment: Environment,
  key: string,
  minimumLength = 32,
): void {
  const value = readString(environment, key);
  if (
    value.length < minimumLength ||
    value.startsWith('REPLACE_WITH_') ||
    ['password', 'postgres', 'guest', 'changeme'].includes(value.toLowerCase())
  ) {
    throw new Error(
      key + ' must be a unique, non-placeholder secret with at least ' + minimumLength + ' characters',
    );
  }
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
  if (expectedScheme === 'https:' && (parsed.username || parsed.password)) {
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

export function assertPrivateN8nServiceUrl(value: string, configKey: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(configKey + ' must be a valid absolute URL');
  }

  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== 'n8n' ||
    parsed.port !== '5678' ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(
      configKey +
        ' must use the private Docker service URL http://n8n:5678 when local infrastructure is enabled',
    );
  }
}

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

  const allowLocalInfra = isEnabled(
    environment.ALLOW_LOCAL_INFRA_IN_PRODUCTION,
  );
  const useLocalDb = isEnabled(environment.USE_LOCAL_DB);
  const useLocalAmqp = isEnabled(environment.USE_LOCAL_AMQP);
  const useCloudAmqp = isEnabled(environment.USE_CLOUD_AMQP);
  const databaseUrl = readString(environment, 'DATABASE_URL');
  const rabbitmqUrl = readString(environment, 'RABBITMQ_URL');

  if (useLocalDb && !allowLocalInfra) {
    throw new Error(
      'USE_LOCAL_DB must not be true in production unless ALLOW_LOCAL_INFRA_IN_PRODUCTION=true',
    );
  }
  if (useLocalAmqp && !allowLocalInfra) {
    throw new Error(
      'USE_LOCAL_AMQP must not be true in production unless ALLOW_LOCAL_INFRA_IN_PRODUCTION=true',
    );
  }

  if (useLocalDb) {
    if (databaseUrl) {
      throw new Error(
        'DATABASE_URL must be empty when USE_LOCAL_DB=true',
      );
    }
    if (readString(environment, 'LOCAL_DB_HOST') !== 'postgres') {
      throw new Error(
        'LOCAL_DB_HOST must be the private Compose service name "postgres" when USE_LOCAL_DB=true',
      );
    }
    if (!readString(environment, 'LOCAL_DB_NAME')) {
      throw new Error('LOCAL_DB_NAME is required when USE_LOCAL_DB=true');
    }
    if (
      !readString(environment, 'LOCAL_DB_USER') ||
      readString(environment, 'LOCAL_DB_USER').toLowerCase() === 'postgres'
    ) {
      throw new Error(
        'LOCAL_DB_USER must be a dedicated non-postgres application role when USE_LOCAL_DB=true',
      );
    }
    assertRequiredSecret(environment, 'LOCAL_DB_PASSWORD');
  } else if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in production when USE_LOCAL_DB=false');
  }

  if (useLocalAmqp) {
    if (rabbitmqUrl) {
      throw new Error(
        'RABBITMQ_URL must be empty when USE_LOCAL_AMQP=true',
      );
    }
    if (useCloudAmqp) {
      throw new Error(
        'USE_CLOUD_AMQP must not be true with USE_LOCAL_AMQP=true',
      );
    }
    if (readString(environment, 'LOCAL_RABBITMQ_HOST') !== 'rabbitmq') {
      throw new Error(
        'LOCAL_RABBITMQ_HOST must be the private Compose service name "rabbitmq" when USE_LOCAL_AMQP=true',
      );
    }
    if (
      !readString(environment, 'LOCAL_RABBITMQ_USER') ||
      readString(environment, 'LOCAL_RABBITMQ_USER').toLowerCase() === 'guest'
    ) {
      throw new Error(
        'LOCAL_RABBITMQ_USER must not use the default guest account',
      );
    }
    assertRequiredSecret(environment, 'LOCAL_RABBITMQ_PASSWORD');
  } else {
    if (!rabbitmqUrl) {
      throw new Error('RABBITMQ_URL is required in production when USE_LOCAL_AMQP=false');
    }
    assertUrlUsesScheme(rabbitmqUrl, 'amqps:', 'RABBITMQ_URL');
  }

  // These are application-to-application trust roots. They are required in
  // every production topology, not only when both local services are enabled.
  for (const key of [
    'JWT_SECRET',
    'N8N_API_KEY',
    'N8N_WEBHOOK_SECRET',
    'N8N_ENCRYPTION_KEY',
  ]) {
    assertRequiredSecret(environment, key);
  }

  const machineSecrets = [
    readString(environment, 'JWT_SECRET'),
    readString(environment, 'N8N_API_KEY'),
    readString(environment, 'N8N_WEBHOOK_SECRET'),
    readString(environment, 'N8N_ENCRYPTION_KEY'),
  ];
  if (new Set(machineSecrets).size !== machineSecrets.length) {
    throw new Error(
      'JWT_SECRET, N8N_API_KEY, N8N_WEBHOOK_SECRET, and N8N_ENCRYPTION_KEY must all be different secrets',
    );
  }

  for (const key of PRODUCTION_N8N_URL_KEYS) {
    const value = readString(environment, key);
    if (value) {
      if (allowLocalInfra && value.startsWith('http://')) {
        // Backend-to-n8n traffic stays on the isolated Compose network.
        assertPrivateN8nServiceUrl(value, key);
      } else {
        assertUrlUsesScheme(value, 'https:', key);
      }
    }
  }

  return environment;
}
