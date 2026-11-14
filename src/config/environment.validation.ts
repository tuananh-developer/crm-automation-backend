/**
 * Fail-closed validation for production-only transport and persistence settings.
 *
 * Production defaults to managed PostgreSQL + AMQPS. A single-EC2 Docker Compose
 * deployment may explicitly opt into private, self-hosted PostgreSQL/RabbitMQ by
 * setting ALLOW_LOCAL_INFRA_IN_PRODUCTION=true and both USE_LOCAL_DB/USE_LOCAL_AMQP.
 * That mode is deliberately pinned to Compose service DNS names and non-default
 * credentials; its services must not publish database/broker ports to the host.
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
        ' must use the private Docker service URL http://n8n:5678 in local production infrastructure mode',
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
  const databaseUrl = readString(environment, 'DATABASE_URL');
  const rabbitmqUrl = readString(environment, 'RABBITMQ_URL');

  if (allowLocalInfra) {
    if (!useLocalDb || !useLocalAmqp) {
      throw new Error(
        'ALLOW_LOCAL_INFRA_IN_PRODUCTION requires USE_LOCAL_DB=true and USE_LOCAL_AMQP=true',
      );
    }
    if (databaseUrl || rabbitmqUrl) {
      throw new Error(
        'Local production infrastructure mode must not also configure DATABASE_URL or RABBITMQ_URL',
      );
    }
    if (isEnabled(environment.USE_CLOUD_AMQP)) {
      throw new Error(
        'USE_CLOUD_AMQP must not be true with ALLOW_LOCAL_INFRA_IN_PRODUCTION',
      );
    }

    if (readString(environment, 'LOCAL_DB_HOST') !== 'postgres') {
      throw new Error(
        'LOCAL_DB_HOST must be the private Compose service name "postgres" in local production infrastructure mode',
      );
    }
    if (!readString(environment, 'LOCAL_DB_NAME')) {
      throw new Error('LOCAL_DB_NAME is required in local production infrastructure mode');
    }
    if (
      !readString(environment, 'LOCAL_DB_USER') ||
      readString(environment, 'LOCAL_DB_USER').toLowerCase() === 'postgres'
    ) {
      throw new Error(
        'LOCAL_DB_USER must be a dedicated non-postgres application role in local production infrastructure mode',
      );
    }
    assertRequiredSecret(environment, 'LOCAL_DB_PASSWORD');

    if (readString(environment, 'LOCAL_RABBITMQ_HOST') !== 'rabbitmq') {
      throw new Error(
        'LOCAL_RABBITMQ_HOST must be the private Compose service name "rabbitmq" in local production infrastructure mode',
      );
    }
    if (
      !readString(environment, 'LOCAL_RABBITMQ_USER') ||
      readString(environment, 'LOCAL_RABBITMQ_USER').toLowerCase() === 'guest'
    ) {
      throw new Error(
        'LOCAL_RABBITMQ_USER must not use the default guest account in local production infrastructure mode',
      );
    }
    assertRequiredSecret(environment, 'LOCAL_RABBITMQ_PASSWORD');

    // These are the application-to-application trust roots used by JWT auth,
    // n8n callbacks, and encryption of n8n's persisted credentials.
    assertRequiredSecret(environment, 'JWT_SECRET');
    assertRequiredSecret(environment, 'N8N_API_KEY');
    assertRequiredSecret(environment, 'N8N_WEBHOOK_SECRET');
    assertRequiredSecret(environment, 'N8N_ENCRYPTION_KEY');

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
  } else {
    if (useLocalDb) {
      throw new Error(
        'USE_LOCAL_DB must not be true in production unless ALLOW_LOCAL_INFRA_IN_PRODUCTION=true',
      );
    }
    if (useLocalAmqp) {
      throw new Error(
        'USE_LOCAL_AMQP must not be true in production unless ALLOW_LOCAL_INFRA_IN_PRODUCTION=true',
      );
    }
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production');
    }
    if (!rabbitmqUrl) {
      throw new Error('RABBITMQ_URL is required in production');
    }
    assertUrlUsesScheme(rabbitmqUrl, 'amqps:', 'RABBITMQ_URL');
  }

  for (const key of PRODUCTION_N8N_URL_KEYS) {
    const value = readString(environment, key);
    if (value) {
      if (allowLocalInfra && value.startsWith('http://')) {
        // Backend-to-n8n traffic stays on the isolated Compose network. Public
        // webhook URLs are still HTTPS and are configured inside the n8n service.
        assertPrivateN8nServiceUrl(value, key);
      } else {
        assertUrlUsesScheme(value, 'https:', key);
      }
    }
  }

  return environment;
}
