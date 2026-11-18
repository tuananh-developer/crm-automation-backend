import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtOrN8nAuthGuard } from './jwt-or-n8n-auth.guard.js';
import type { JwtAuthGuard } from './jwt-auth.guard.js';
import type { N8nAuthGuard } from '../../modules/lead-intelligence/guards/n8n-auth.guard.js';

describe('JwtOrN8nAuthGuard', () => {
  let guard: JwtOrN8nAuthGuard;
  let jwtAuthGuard: jest.Mocked<Partial<JwtAuthGuard>>;
  let n8nAuthGuard: jest.Mocked<Partial<N8nAuthGuard>>;

  beforeEach(() => {
    jwtAuthGuard = {
      canActivate: jest.fn(),
    };
    n8nAuthGuard = {
      canActivate: jest.fn(),
    };

    guard = new JwtOrN8nAuthGuard(
      jwtAuthGuard as JwtAuthGuard,
      n8nAuthGuard as N8nAuthGuard,
    );
  });

  const createMockContext = (
    headers: Record<string, string>,
    user?: unknown,
  ): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ headers, user }),
      }),
    }) as unknown as ExecutionContext;

  it('returns true immediately if request already has authenticated user', async () => {
    const context = createMockContext({}, { id: 'user-1' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(n8nAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to n8nAuthGuard when x-n8n-api-key header is present', async () => {
    (n8nAuthGuard.canActivate as jest.Mock).mockReturnValue(true);
    const context = createMockContext({ 'x-n8n-api-key': 'secret-token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(n8nAuthGuard.canActivate).toHaveBeenCalledWith(context);
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to n8nAuthGuard when x-api-key header is present', async () => {
    (n8nAuthGuard.canActivate as jest.Mock).mockReturnValue(true);
    const context = createMockContext({ 'x-api-key': 'secret-token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(n8nAuthGuard.canActivate).toHaveBeenCalledWith(context);
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to jwtAuthGuard when standard Bearer authorization header is used', async () => {
    (jwtAuthGuard.canActivate as jest.Mock).mockResolvedValue(true);
    const context = createMockContext({
      authorization: 'Bearer user-jwt-token',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtAuthGuard.canActivate).toHaveBeenCalledWith(context);
  });

  it('falls back to n8nAuthGuard when jwtAuthGuard fails and Bearer is n8n secret', async () => {
    (jwtAuthGuard.canActivate as jest.Mock).mockRejectedValue(
      new UnauthorizedException('Invalid JWT'),
    );
    (n8nAuthGuard.canActivate as jest.Mock).mockReturnValue(true);

    const context = createMockContext({
      authorization: 'Bearer n8n-secret-token',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtAuthGuard.canActivate).toHaveBeenCalledWith(context);
    expect(n8nAuthGuard.canActivate).toHaveBeenCalledWith(context);
  });

  it('throws UnauthorizedException when both guards fail', async () => {
    (jwtAuthGuard.canActivate as jest.Mock).mockRejectedValue(
      new UnauthorizedException('Invalid token'),
    );
    (n8nAuthGuard.canActivate as jest.Mock).mockImplementation(() => {
      throw new UnauthorizedException('Invalid n8n key');
    });

    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
