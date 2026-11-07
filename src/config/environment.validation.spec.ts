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

  it('keeps development configuration compatible with local Docker services', () => {
    const environment = {
      NODE_ENV: 'development',
      USE_LOCAL_DB: 'true',
      N8N_BASE_URL: 'http://localhost:5678',
    };

    expect(validateEnvironmentConfiguration(environment)).toBe(environment);
  });

  it('requires a remote database and disallows the local database fallback in production', () => {
    const missingDatabase = productionEnvironment();
    missingDatabase.DATABASE_URL = '';
    expect(() =>
      validateEnvironmentConfiguration(missingDatabase),
    ).toThrow('DATABASE_URL is required in production');

    const localDatabase = productionEnvironment();
    localDatabase.USE_LOCAL_DB = 'true';
    expect(() =>
      validateEnvironmentConfiguration(localDatabase),
    ).toThrow('USE_LOCAL_DB must not be true');
  });

  it('requires AMQPS for the production RabbitMQ URL', () => {
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
