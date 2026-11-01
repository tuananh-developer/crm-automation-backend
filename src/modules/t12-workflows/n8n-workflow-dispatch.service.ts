import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class N8nWorkflowDispatchService {
  private readonly logger = new Logger(N8nWorkflowDispatchService.name);

  constructor(private readonly configService: ConfigService) {}

  async dispatch(
    workflowUrlKey:
      'N8N_WF10_WEBHOOK_URL' | 'N8N_WF11_WEBHOOK_URL' | 'N8N_WF12_WEBHOOK_URL',
    workflowPath: string,
    payload: Record<string, unknown>,
  ): Promise<{ acknowledged: boolean; httpStatus: number }> {
    const secret =
      this.configService.get<string>('N8N_API_KEY') ||
      this.configService.get<string>('N8N_WEBHOOK_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'N8N_API_KEY or N8N_WEBHOOK_SECRET is not configured',
      );
    }

    const baseUrl = this.configService.get<string>('N8N_BASE_URL');
    const configuredUrl = this.configService.get<string>(workflowUrlKey);
    const url =
      configuredUrl ||
      (baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/webhook/${workflowPath.replace(/^\//, '')}`
        : undefined);
    if (!url) {
      throw new InternalServerErrorException(
        `${workflowUrlKey} or N8N_BASE_URL must be configured before dispatch`,
      );
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-N8N-API-KEY': secret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`n8n dispatch failed for ${workflowPath}: ${message}`);
      throw new ServiceUnavailableException('Unable to reach n8n webhook');
    }

    // Do not log the payload: it can contain CRM or transcript data.
    if (!response.ok) {
      this.logger.error(
        `n8n webhook ${workflowPath} returned HTTP ${response.status}`,
      );
      throw new ServiceUnavailableException(
        `n8n webhook rejected dispatch (HTTP ${response.status})`,
      );
    }

    return { acknowledged: true, httpStatus: response.status };
  }
}
