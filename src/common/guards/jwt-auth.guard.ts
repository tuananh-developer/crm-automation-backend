import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const hasN8nHeader = Boolean(
      request?.headers &&
      (request.headers['x-n8n-api-key'] ||
        request.headers['x-api-key'] ||
        request.headers['x-webhook-secret'] ||
        request.headers['x-n8n-webhook-secret']),
    );

    if (hasN8nHeader && context.getHandler()) {
      const handlerGuards: unknown = Reflect.getMetadata(
        '__guards__',
        context.getHandler(),
      );
      if (Array.isArray(handlerGuards)) {
        const hasServiceGuard = handlerGuards.some((g: unknown) => {
          if (typeof g === 'function') {
            return g.name === 'JwtOrN8nAuthGuard' || g.name === 'N8nAuthGuard';
          }
          return false;
        });
        if (hasServiceGuard) {
          return true;
        }
      }
    }

    return super.canActivate(context);
  }

  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    if (err instanceof Error) {
      throw err;
    }

    if (err || !user) {
      const message =
        info instanceof Error
          ? info.message
          : 'Unauthorized: missing or invalid authentication token';
      throw new UnauthorizedException(message);
    }
    return user;
  }
}
