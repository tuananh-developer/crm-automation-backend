import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DEFAULT_N8N_WEBHOOK_BASE_URL = 'http://localhost:5678/webhook';
export const DEFAULT_N8N_WEBHOOK_TIMEOUT_MS = 15000;

export class N8nWebhookError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    readonly responseBody: Record<string, any> | null,
  ) {
    super(message);
    this.name = 'N8nWebhookError';
  }
}

@Injectable()
export class N8nClientService {
  private readonly logger = new Logger(N8nClientService.name);

  constructor(private readonly configService: ConfigService) {}

  buildWebhookUrl(webhookPath: string): string {
    const baseUrl = (
      this.configService.get<string>('N8N_WEBHOOK_BASE_URL') ||
      DEFAULT_N8N_WEBHOOK_BASE_URL
    ).replace(/\/+$/, '');

    return `${baseUrl}/${webhookPath.replace(/^\/+/, '')}`;
  }

  async triggerWebhook<TResponse = Record<string, any>>(
    webhookPath: string,
    payload: Record<string, any>,
  ): Promise<TResponse> {
    const url = this.buildWebhookUrl(webhookPath);
    const timeoutMs = this.configService.get<number>(
      'N8N_WEBHOOK_TIMEOUT_MS',
      DEFAULT_N8N_WEBHOOK_TIMEOUT_MS,
    );

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      const bodyText = await response.text();
      const parsedBody = this.parseBody(bodyText);

      if (!response.ok) {
        throw new N8nWebhookError(
          `n8n webhook '${webhookPath}' responded with HTTP ${response.status}: ${this.extractErrorMessage(parsedBody) ?? bodyText}`,
          response.status,
          parsedBody,
        );
      }

      this.logger.log(`n8n webhook '${webhookPath}' responded successfully`);
      return parsedBody as TResponse;
    } catch (error: unknown) {
      if (error instanceof N8nWebhookError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new N8nWebhookError(
          `n8n webhook '${webhookPath}' timed out after ${timeoutMs}ms`,
          null,
          { timeout: true, timeoutMs },
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new N8nWebhookError(
        `Failed to call n8n webhook '${webhookPath}': ${message}`,
        null,
        null,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseBody(bodyText: string): Record<string, any> {
    if (!bodyText) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(bodyText);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, any>)
        : { raw: parsed };
    } catch {
      return { raw: bodyText };
    }
  }

  private extractErrorMessage(body: Record<string, any>): string | null {
    const candidate: unknown = body?.error ?? body?.message;
    return typeof candidate === 'string' && candidate.trim() ? candidate : null;
  }
}
