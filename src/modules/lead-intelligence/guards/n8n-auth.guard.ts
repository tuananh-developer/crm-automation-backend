import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class N8nAuthGuard implements CanActivate {
  private readonly logger = new Logger(N8nAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';

    const expectedKey =
      this.configService.get<string>('N8N_API_KEY') ||
      this.configService.get<string>('N8N_WEBHOOK_SECRET');

    // Fail-Closed: Never bypass when secret is unconfigured
    if (!expectedKey) {
      if (isProduction) {
        this.logger.error(
          'Webhook authentication secret is not configured in production',
        );
        throw new InternalServerErrorException(
          'Webhook authentication secret is not configured',
        );
      }

      this.logger.warn(
        'Webhook authentication secret (N8N_API_KEY / N8N_WEBHOOK_SECRET) is not configured in environment. Rejecting webhook request (Fail-Closed).',
      );
      throw new UnauthorizedException(
        'Webhook authentication secret is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKeyHeader =
      (request.headers['x-n8n-api-key'] as string) ||
      (request.headers['x-api-key'] as string) ||
      (request.headers['x-webhook-secret'] as string);

    if (apiKeyHeader && apiKeyHeader === expectedKey) {
      return true;
    }

    // Also support Authorization: Bearer <key>
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token === expectedKey) {
        return true;
      }
    }

    throw new UnauthorizedException(
      'Invalid or missing n8n callback authentication credential',
    );
  }
}
