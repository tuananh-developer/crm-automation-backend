import {
  ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { N8nAuthGuard } from './n8n-auth.guard.js';

describe('N8nAuthGuard', () => {
  let guard: N8nAuthGuard;
  let configService: { get: jest.Mock };

  const createMockContext = (
    headers: Record<string, string>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    };
    guard = new N8nAuthGuard(configService as unknown as ConfigService);
  });

  it('should throw InternalServerErrorException in production when secret is not configured', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'NODE_ENV' ? 'production' : undefined,
    );

    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(
      InternalServerErrorException,
    );
  });

  it('should throw UnauthorizedException in non-production when secret is not configured (Fail-Closed)', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'NODE_ENV' ? 'development' : undefined,
    );

    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should allow request when x-api-key matches configured key', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'N8N_API_KEY' ? 'secret-token-123' : undefined,
    );

    const context = createMockContext({ 'x-api-key': 'secret-token-123' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow request when x-n8n-api-key matches configured key', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'N8N_API_KEY' ? 'secret-token-123' : undefined,
    );

    const context = createMockContext({ 'x-n8n-api-key': 'secret-token-123' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow request when x-webhook-secret matches configured key', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'N8N_WEBHOOK_SECRET' ? 'secret-token-123' : undefined,
    );

    const context = createMockContext({
      'x-webhook-secret': 'secret-token-123',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow request with Bearer authorization header', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'N8N_API_KEY' ? 'secret-token-123' : undefined,
    );

    const context = createMockContext({
      authorization: 'Bearer secret-token-123',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when key does not match', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'N8N_API_KEY' ? 'secret-token-123' : undefined,
    );

    const context = createMockContext({ 'x-api-key': 'wrong-key' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when header is missing', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'N8N_API_KEY' ? 'secret-token-123' : undefined,
    );

    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
