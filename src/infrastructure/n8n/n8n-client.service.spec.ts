import { ConfigService } from '@nestjs/config';
import {
  N8nClientService,
  N8nWebhookError,
} from './n8n-client.service.js';

describe('N8nClientService', () => {
  const createClient = (values: Record<string, string | number> = {}) => {
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in values ? values[key] : defaultValue,
      ),
    };
    return {
      client: new N8nClientService(config as unknown as ConfigService),
      config,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails closed when no machine credential is configured', async () => {
    const { client } = createClient();
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      client.triggerWebhook('follow-up-execute', { executionId: 'execution-1' }),
    ).rejects.toMatchObject({
      name: 'N8nWebhookError',
      retryable: false,
      statusCode: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the service key and rejects redirects', async () => {
    const { client } = createClient({
      N8N_API_KEY: 'machine-secret',
      N8N_WEBHOOK_BASE_URL: 'https://n8n.example/webhook/',
      N8N_WEBHOOK_TIMEOUT_MS: 1000,
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ success: true })),
    } as Response);

    await expect(
      client.triggerWebhook('follow-up-execute', { executionId: 'execution-1' }),
    ).resolves.toEqual({ success: true });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://n8n.example/webhook/follow-up-execute',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          'X-N8N-API-KEY': 'machine-secret',
        }),
        body: JSON.stringify({ executionId: 'execution-1' }),
      }),
    );
  });

  it('classifies validation failures as permanent', async () => {
    const { client } = createClient({ N8N_API_KEY: 'machine-secret' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' })),
    } as Response);

    try {
      await client.triggerWebhook('follow-up-execute', {});
      throw new Error('Expected webhook call to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(N8nWebhookError);
      expect(error).toMatchObject({
        statusCode: 401,
        retryable: false,
      });
    }
  });

  it('classifies a locked enrollment as retryable after resume', async () => {
    const { client } = createClient({ N8N_API_KEY: 'machine-secret' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 423,
      text: () => Promise.resolve(JSON.stringify({ message: 'Enrollment is paused' })),
    } as Response);

    await expect(client.triggerWebhook('follow-up-execute', {})).rejects.toMatchObject({
      statusCode: 423,
      retryable: true,
    });
  });

  it('classifies rate limiting as retryable', async () => {
    const { client } = createClient({ N8N_API_KEY: 'machine-secret' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve(JSON.stringify({ message: 'Rate limited' })),
    } as Response);

    await expect(client.triggerWebhook('follow-up-execute', {})).rejects.toMatchObject({
      statusCode: 429,
      retryable: true,
    });
  });

  it('classifies server failures as retryable', async () => {
    const { client } = createClient({ N8N_API_KEY: 'machine-secret' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(JSON.stringify({ message: 'Unavailable' })),
    } as Response);

    await expect(client.triggerWebhook('follow-up-execute', {})).rejects.toMatchObject({
      statusCode: 503,
      retryable: true,
    });
  });
});
