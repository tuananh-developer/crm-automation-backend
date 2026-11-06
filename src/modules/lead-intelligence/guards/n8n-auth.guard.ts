import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class N8nAuthGuard implements CanActivate {
  private readonly logger = new Logger(N8nAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  private safeCompare(actual: string, expected: string): boolean {
    // Hash both values first so timingSafeEqual always compares fixed-size
    // digests instead of returning early when the input lengths differ.
    const actualDigest = createHash('sha256').update(actual, 'utf8').digest();
    const expectedDigest = createHash('sha256')
      .update(expected, 'utf8')
      .digest();
    return timingSafeEqual(actualDigest, expectedDigest);
  }

  canActivate(context: ExecutionContext): boolean {
    const nodeEnv = (
      this.configService.get<string>('NODE_ENV') ||
      process.env.NODE_ENV ||
      ''
    ).toLowerCase();
    const isDevOrTest = ['development', 'test'].includes(nodeEnv);

    const expectedKey =
      this.configService.get<string>('N8N_API_KEY') ||
      this.configService.get<string>('N8N_WEBHOOK_SECRET');

    // Fail-Closed: Never bypass when secret is unconfigured
    if (!expectedKey) {
      if (!isDevOrTest) {
        this.logger.error(
          `Webhook authentication secret is not configured in ${nodeEnv || 'production'} environment`,
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
      (request.headers['x-webhook-secret'] as string) ||
      (request.headers['x-n8n-webhook-secret'] as string);

    if (apiKeyHeader && this.safeCompare(apiKeyHeader, expectedKey)) {
      return true;
    }

    // Also support Authorization: Bearer <key>
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (this.safeCompare(token, expectedKey)) {
        return true;
      }
    }

    throw new UnauthorizedException(
      'Invalid or missing n8n callback authentication credential',
    );
  }
}
