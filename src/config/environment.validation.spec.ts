import {
  assertUrlUsesScheme,
  validateEnvironmentConfiguration,
} from './environment.validation.js';

describe('validateEnvironmentConfiguration', () => {
  const productionEnvironment = () => ({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://crm:secret@db.example.test:5432/crm',
    USE_LOCAL_DB: 'false',
    RABBITMQ_URL: 'amqps://broker.example.test/vhost',
    N8N_BASE_URL: 'https://n8n.example.test',
    N8N_WF10_WEBHOOK_URL: '',
    N8N_WF11_WEBHOOK_URL: '',
    N8N_WF12_WEBHOOK_URL: '',
  });

  const privateComposeProductionEnvironment = () => ({
    NODE_ENV: 'production',
    ALLOW_LOCAL_INFRA_IN_PRODUCTION: 'true',
    USE_LOCAL_DB: 'true',
    USE_LOCAL_AMQP: 'true',
    USE_CLOUD_AMQP: 'false',
    LOCAL_DB_HOST: 'postgres',
    LOCAL_DB_PORT: '5432',
    LOCAL_DB_NAME: 'crm_backend',
    LOCAL_DB_USER: 'crm_app',
    LOCAL_DB_PASSWORD: 'db-secret-' + 'a'.repeat(40),
    LOCAL_RABBITMQ_HOST: 'rabbitmq',
    LOCAL_RABBITMQ_PORT: '5672',
    LOCAL_RABBITMQ_USER: 'crm_broker',
    LOCAL_RABBITMQ_PASSWORD: 'rabbit-secret-' + 'b'.repeat(40),
    N8N_BASE_URL: 'https://n8n.example.test',
    N8N_WEBHOOK_BASE_URL: 'https://n8n.example.test/webhook',
  });

  it('keeps development configuration compatible with local Docker services', () => {
    const environment = {
      NODE_ENV: 'development',
      USE_LOCAL_DB: 'true',
      N8N_BASE_URL: 'http://localhost:5678',
    };

    expect(validateEnvironmentConfiguration(environment)).toBe(environment);
  });

  it('requires managed production database and broker unless private Compose mode is explicit', () => {
    const missingDatabase = productionEnvironment();
    missingDatabase.DATABASE_URL = '';
    expect(() =>
      validateEnvironmentConfiguration(missingDatabase),
    ).toThrow('DATABASE_URL is required in production');

    const localDatabase = productionEnvironment();
    localDatabase.USE_LOCAL_DB = 'true';
    expect(() =>
      validateEnvironmentConfiguration(localDatabase),
    ).toThrow('ALLOW_LOCAL_INFRA_IN_PRODUCTION=true');
  });

  it('accepts private Docker Compose PostgreSQL and RabbitMQ with dedicated strong credentials', () => {
    const environment = privateComposeProductionEnvironment();
    expect(validateEnvironmentConfiguration(environment)).toBe(environment);
  });

  it('requires the private Compose service DNS names and non-default credentials', () => {
    const wrongDatabaseHost = privateComposeProductionEnvironment();
    wrongDatabaseHost.LOCAL_DB_HOST = 'localhost';
    expect(() =>
      validateEnvironmentConfiguration(wrongDatabaseHost),
    ).toThrow('LOCAL_DB_HOST must be the private Compose service name');

    const weakDatabasePassword = privateComposeProductionEnvironment();
    weakDatabasePassword.LOCAL_DB_PASSWORD = 'postgres';
    expect(() =>
      validateEnvironmentConfiguration(weakDatabasePassword),
    ).toThrow('LOCAL_DB_PASSWORD must be configured with at least 32 characters');

    const defaultRabbitUser = privateComposeProductionEnvironment();
    defaultRabbitUser.LOCAL_RABBITMQ_USER = 'guest';
    expect(() =>
      validateEnvironmentConfiguration(defaultRabbitUser),
    ).toThrow('must not use the default guest account');
  });

  it('does not allow mixed local and managed production broker modes', () => {
    const environment = privateComposeProductionEnvironment();
    environment.USE_CLOUD_AMQP = 'true';
    expect(() =>
      validateEnvironmentConfiguration(environment),
    ).toThrow('USE_CLOUD_AMQP must not be true');
  });

  it('requires AMQPS for the managed production RabbitMQ URL', () => {
    const environment = productionEnvironment();
    environment.RABBITMQ_URL = 'amqp://broker.example.test/vhost';

    expect(() => validateEnvironmentConfiguration(environment)).toThrow(
      'RABBITMQ_URL must use amqps in production',
    );
  });

  it('requires HTTPS for every configured n8n production URL', () => {
    const environment = productionEnvironment();
    environment.N8N_WF11_WEBHOOK_URL =
      'http://n8n.example.test/webhook/sales-meeting';

    expect(() => validateEnvironmentConfiguration(environment)).toThrow(
      'N8N_WF11_WEBHOOK_URL must use https in production',
    );
  });

  it('rejects URL-embedded credentials and fragments', () => {
    expect(() =>
      assertUrlUsesScheme(
        'https://user:password@n8n.example.test/webhook',
        'https:',
        'N8N_BASE_URL',
      ),
    ).toThrow('must not embed credentials');

    expect(() =>
      assertUrlUsesScheme(
        'https://n8n.example.test/webhook#fragment',
        'https:',
        'N8N_BASE_URL',
      ),
    ).toThrow('must not contain a URL fragment');
  });

  it('accepts production configuration with encrypted transports and AMQPS credentials', () => {
    const environment = productionEnvironment();
    environment.RABBITMQ_URL = 'amqps://crm:secret@broker.example.test/vhost';
    expect(validateEnvironmentConfiguration(environment)).toBe(environment);
  });
});
