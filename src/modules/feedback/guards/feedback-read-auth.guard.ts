import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { N8nAuthGuard } from '../../lead-intelligence/guards/n8n-auth.guard.js';

@Injectable()
export class FeedbackReadAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly n8nAuthGuard: N8nAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>() as Request & {
      user?: unknown;
    };
    if (request.user) {
      return true;
    }

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
      const result = this.jwtAuthGuard.canActivate(context);
      const resolved = isObservable(result)
        ? await lastValueFrom(result)
        : await result;
      return Boolean(resolved);
    } catch (jwtErr) {
      if (request.headers.authorization?.startsWith('Bearer ')) {
        try {
          return this.n8nAuthGuard.canActivate(context);
        } catch {
          // Preserve the original JWT unauthorized error for browser callers.
        }
      }
      if (jwtErr instanceof Error) {
        throw jwtErr;
      }
      throw new UnauthorizedException('Authentication required');
    }
  }
}
