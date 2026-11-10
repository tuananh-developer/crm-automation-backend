import type { ConfigService } from '@nestjs/config';
import { N8nClientService, N8nWebhookError } from './n8n-client.service.js';

describe('N8nClientService follow-up webhook authentication', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the configured webhook secret for WF04', async () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          N8N_WEBHOOK_BASE_URL: 'http://n8n.test/webhook',
          N8N_WEBHOOK_SECRET: 'test-secret-value',
        };
        return key in values ? values[key] : defaultValue;
      }),
    };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ success: true })),
    } as Response);
    const service = new N8nClientService(
      configService as unknown as ConfigService,
    );

    await service.triggerWebhook('follow-up-execute', {
      executionId: 'exec-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://n8n.test/webhook/follow-up-execute',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret-value',
        },
      }),
    );
  });

  it('fails closed when the WF04 webhook secret is missing', async () => {
    const configService = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    };
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const service = new N8nClientService(
      configService as unknown as ConfigService,
    );

    await expect(
      service.triggerWebhook('follow-up-execute', { executionId: 'exec-1' }),
    ).rejects.toBeInstanceOf(N8nWebhookError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
