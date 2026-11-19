import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { FeedbackReadAuthGuard } from './feedback-read-auth.guard.js';
import { N8nAuthGuard } from '../../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';

function createHttpContext(
  headers: Record<string, string | undefined>,
  user?: unknown,
) {
  const request = { headers, user } as unknown as Request;
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('FeedbackReadAuthGuard', () => {
  const secret = 'test-n8n-secret-value';

  const makeGuard = (jwtResult: () => Promise<boolean> | boolean) => {
    const jwtCanActivate = jest.fn(jwtResult);
    const jwtAuthGuard = {
      canActivate: jwtCanActivate,
    } as unknown as JwtAuthGuard;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'N8N_API_KEY'
          ? secret
          : key === 'NODE_ENV'
            ? 'test'
            : undefined,
      ),
    } as unknown as ConfigService;
    const n8nAuthGuard = new N8nAuthGuard(configService);
    return {
      guard: new FeedbackReadAuthGuard(jwtAuthGuard, n8nAuthGuard),
      jwtCanActivate,
    };
  };

  it('allows internal WF05 requests with a valid X-N8N-API-KEY header without calling JwtAuthGuard', async () => {
    const { guard, jwtCanActivate } = makeGuard(() => {
      throw new UnauthorizedException('No JWT');
    });

    const allowed = await guard.canActivate(
      createHttpContext({ 'x-n8n-api-key': secret }),
    );

    expect(allowed).toBe(true);
    expect(jwtCanActivate).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid X-N8N-API-KEY header even if JwtAuthGuard would allow', async () => {
    const { guard, jwtCanActivate } = makeGuard(() => true);

    await expect(
      guard.canActivate(createHttpContext({ 'x-n8n-api-key': 'wrong-key' })),
    ).rejects.toThrow(UnauthorizedException);
    expect(jwtCanActivate).not.toHaveBeenCalled();
  });

  it('allows browser callers with a valid JWT token', async () => {
    const { guard, jwtCanActivate } = makeGuard(() => Promise.resolve(true));

    const allowed = await guard.canActivate(
      createHttpContext({ authorization: 'Bearer valid.jwt.token' }),
    );

    expect(allowed).toBe(true);
    expect(jwtCanActivate).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated requests carrying neither JWT nor N8N key', async () => {
    const { guard } = makeGuard(() => {
      throw new UnauthorizedException('Unauthorized');
    });

    await expect(guard.canActivate(createHttpContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
