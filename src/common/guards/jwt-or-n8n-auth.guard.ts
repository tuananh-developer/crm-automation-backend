import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { N8nAuthGuard } from '../../modules/lead-intelligence/guards/n8n-auth.guard.js';
import type { Request } from 'express';

@Injectable()
export class JwtOrN8nAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly n8nAuthGuard: N8nAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const hasN8nHeader = Boolean(
      request.headers['x-n8n-api-key'] ||
      request.headers['x-api-key'] ||
      request.headers['x-webhook-secret'] ||
      request.headers['x-n8n-webhook-secret'],
    );

    if (hasN8nHeader) {
      return this.n8nAuthGuard.canActivate(context);
    }

    try {
      const result = await this.jwtAuthGuard.canActivate(context);
      return Boolean(result);
    } catch (jwtErr) {
      // If authorization header matches n8n secret Bearer token, fallback to N8nAuthGuard
      try {
        return this.n8nAuthGuard.canActivate(context);
      } catch {
        if (jwtErr instanceof Error) {
          throw jwtErr;
        }
        throw new UnauthorizedException('Authentication required');
      }
    }
  }
}
