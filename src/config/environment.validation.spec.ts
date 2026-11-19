import {
  assertUrlUsesScheme,
  validateEnvironmentConfiguration,
} from './environment.validation.js';

describe('validateEnvironmentConfiguration', () => {
  const productionEnvironment = () => ({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://crm:secret@db.example.test:5432/crm?sslmode=require',
    USE_LOCAL_DB: 'false',
    USE_LOCAL_AMQP: 'false',
    USE_CLOUD_AMQP: 'true',
    RABBITMQ_URL: 'amqps://broker.example.test/vhost',
    JWT_SECRET: 'jwt-secret-' + 'a'.repeat(40),
    N8N_API_KEY: 'n8n-api-secret-' + 'b'.repeat(40),
    N8N_WEBHOOK_SECRET: 'n8n-webhook-secret-' + 'c'.repeat(40),
    N8N_ENCRYPTION_KEY: 'n8n-encryption-secret-' + 'd'.repeat(40),
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
    JWT_SECRET: 'jwt-secret-' + 'c'.repeat(40),
    N8N_API_KEY: 'n8n-api-secret-' + 'd'.repeat(40),
    N8N_WEBHOOK_SECRET: 'n8n-webhook-secret-' + 'e'.repeat(40),
    N8N_ENCRYPTION_KEY: 'n8n-encryption-secret-' + 'f'.repeat(40),
    N8N_BASE_URL: 'http://n8n:5678',
    N8N_WEBHOOK_BASE_URL: 'http://n8n:5678/webhook',
  });

  const hybridProductionEnvironment = () => ({
    NODE_ENV: 'production',
    ALLOW_LOCAL_INFRA_IN_PRODUCTION: 'true',
    USE_LOCAL_DB: 'false',
    DATABASE_URL: 'postgresql://crm:secret@db.example.test:5432/crm?sslmode=require',
    USE_LOCAL_AMQP: 'true',
    USE_CLOUD_AMQP: 'false',
    RABBITMQ_URL: '',
    LOCAL_RABBITMQ_HOST: 'rabbitmq',
    LOCAL_RABBITMQ_PORT: '5672',
    LOCAL_RABBITMQ_USER: 'crm_broker',
    LOCAL_RABBITMQ_PASSWORD: 'rabbit-secret-' + 'x'.repeat(40),
    JWT_SECRET: 'jwt-secret-' + '1'.repeat(40),
    N8N_API_KEY: 'n8n-api-secret-' + '2'.repeat(40),
    N8N_WEBHOOK_SECRET: 'n8n-webhook-secret-' + '3'.repeat(40),
    N8N_ENCRYPTION_KEY: 'n8n-encryption-secret-' + '4'.repeat(40),
    N8N_BASE_URL: 'http://n8n:5678',
    N8N_WEBHOOK_BASE_URL: 'http://n8n:5678/webhook',
  });

  it('keeps development configuration compatible with local Docker services', () => {
    const environment = {
      NODE_ENV: 'development',
      USE_LOCAL_DB: 'true',
      N8N_BASE_URL: 'http://localhost:5678',
    };

    expect(validateEnvironmentConfiguration(environment)).toBe(environment);
  });

  it('requires managed production database and broker unless local services are explicitly enabled', () => {
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

  it('accepts Neon PostgreSQL combined with private Docker Compose RabbitMQ and n8n', () => {
    const environment = hybridProductionEnvironment();
    expect(validateEnvironmentConfiguration(environment)).toBe(environment);
  });

  it('requires private Compose DNS names and non-default local service credentials', () => {
    const wrongDatabaseHost = privateComposeProductionEnvironment();
    wrongDatabaseHost.LOCAL_DB_HOST = 'localhost';
    expect(() =>
      validateEnvironmentConfiguration(wrongDatabaseHost),
    ).toThrow('LOCAL_DB_HOST must be the private Compose service name');

    const weakDatabasePassword = privateComposeProductionEnvironment();
    weakDatabasePassword.LOCAL_DB_PASSWORD = 'postgres';
    expect(() =>
      validateEnvironmentConfiguration(weakDatabasePassword),
    ).toThrow('LOCAL_DB_PASSWORD must be a unique, non-placeholder secret with at least 32 characters');

    const defaultRabbitUser = hybridProductionEnvironment();
    defaultRabbitUser.LOCAL_RABBITMQ_USER = 'guest';
    expect(() =>
      validateEnvironmentConfiguration(defaultRabbitUser),
    ).toThrow('must not use the default guest account');
  });

  it('allows only the private n8n service URL for internal production Compose traffic', () => {
    const environment = hybridProductionEnvironment();
    expect(validateEnvironmentConfiguration(environment)).toBe(environment);

    const publicUrl = hybridProductionEnvironment();
    publicUrl.N8N_BASE_URL = 'http://n8n.example.test:5678';
    expect(() =>
      validateEnvironmentConfiguration(publicUrl),
    ).toThrow('must use the private Docker service URL http://n8n:5678');

    const wrongPort = hybridProductionEnvironment();
    wrongPort.N8N_WEBHOOK_BASE_URL = 'http://n8n:8080/webhook';
    expect(() =>
      validateEnvironmentConfiguration(wrongPort),
    ).toThrow('must use the private Docker service URL http://n8n:5678');
  });

  it('rejects placeholder or reused machine-to-machine production secrets', () => {
    const placeholder = hybridProductionEnvironment();
    placeholder.JWT_SECRET = 'REPLACE_WITH_OPENSSL_RANDOM_32_BYTE_HEX';
    expect(() =>
      validateEnvironmentConfiguration(placeholder),
    ).toThrow('JWT_SECRET must be a unique, non-placeholder secret');

    const reused = hybridProductionEnvironment();
    reused.N8N_API_KEY = reused.JWT_SECRET;
    expect(() =>
      validateEnvironmentConfiguration(reused),
    ).toThrow('must all be different secrets');
  });

  it('does not allow local RabbitMQ to be combined with CloudAMQP', () => {
    const environment = hybridProductionEnvironment();
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

  it('requires HTTPS for every configured public n8n production URL', () => {
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
