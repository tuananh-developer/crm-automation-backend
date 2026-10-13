import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride');

    guard = new JwtAuthGuard(reflector);
  });

  const createMockContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
      }),
    }) as unknown as ExecutionContext;

  it('allows access directly when route is decorated with @Public()', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(true);

    const context = createMockContext();
    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('handleRequest returns user when user is present and no error occurred', () => {
    const mockUser = { id: 'user-1', email: 'test@crm.local' };
    const result = guard.handleRequest(null, mockUser, null);

    expect(result).toEqual(mockUser);
  });

  it('handleRequest throws existing error when error is provided', () => {
    const customError = new Error('Custom auth error');

    expect(() => guard.handleRequest(customError, null, null)).toThrow(
      customError,
    );
  });

  it('handleRequest throws UnauthorizedException when user is missing', () => {
    expect(() => guard.handleRequest(null, null, null)).toThrow(
      UnauthorizedException,
    );
  });
});
