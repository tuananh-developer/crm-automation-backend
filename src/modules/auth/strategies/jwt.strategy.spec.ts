import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { UserRole, UserStatus } from '../../users/enums/user.enum.js';
import { JwtStrategy } from './jwt.strategy.js';
import type { JwtPayload } from '../../../common/types/auth.interface.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;

  const mockUser: User = {
    id: 'user-uuid-9999',
    name: 'Active User',
    email: 'active@crm.local',
    passwordHash: 'secret-hash',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const payload: JwtPayload = {
    sub: mockUser.id,
    email: mockUser.email,
    role: mockUser.role,
  };

  beforeEach(async () => {
    usersRepository = {
      findOne: jest.fn(),
    };

    const configService = {
      get: jest.fn().mockReturnValue('test-jwt-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: usersRepository,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('validates and returns sanitized user when user exists and is active', async () => {
    (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

    const result = await strategy.validate(payload);

    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { id: payload.sub },
    });
    expect(result.id).toBe(mockUser.id);
    expect(result.email).toBe(mockUser.email);
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('throws UnauthorizedException when user no longer exists', async () => {
    (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when user is not ACTIVE', async () => {
    (usersRepository.findOne as jest.Mock).mockResolvedValue({
      ...mockUser,
      status: UserStatus.LOCKED,
    });

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException with descriptive message when user is INACTIVE', async () => {
    (usersRepository.findOne as jest.Mock).mockResolvedValue({
      ...mockUser,
      status: UserStatus.INACTIVE,
    });

    await expect(strategy.validate(payload)).rejects.toThrow(
      'User account is inactive and cannot authenticate',
    );
  });

  it('throws Error in production when JWT_SECRET is not configured', () => {
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'JWT_SECRET') return undefined;
        return undefined;
      }),
    };

    expect(
      () =>
        new JwtStrategy(
          configService as unknown as ConfigService,
          usersRepository as Repository<User>,
        ),
    ).toThrow(
      'FATAL: JWT_SECRET environment variable is missing in production environment',
    );
  });

  it('throws Error when process.env.NODE_ENV is production and JWT_SECRET is not configured', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const configService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      expect(
        () =>
          new JwtStrategy(
            configService as unknown as ConfigService,
            usersRepository as Repository<User>,
          ),
      ).toThrow(
        'FATAL: JWT_SECRET environment variable is missing in production environment',
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('allows fallback development secret when not in production', () => {
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'JWT_SECRET') return undefined;
        return undefined;
      }),
    };

    expect(
      () =>
        new JwtStrategy(
          configService as unknown as ConfigService,
          usersRepository as Repository<User>,
        ),
    ).not.toThrow();
  });
});
