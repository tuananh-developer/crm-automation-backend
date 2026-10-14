import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;

  const mockUser: User = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Test Sales Rep',
    email: 'sales@crm.local',
    passwordHash: '$2b$10$hashedpasswordstringforauth',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: new Date('2026-10-10T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-10T00:00:00.000Z'),
  };

  beforeEach(async () => {
    usersRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token-xyz'),
    };

    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'JWT_SECRET') return 'test-secret';
          if (key === 'JWT_EXPIRES_IN_SECONDS') return 86400;
          return defaultValue;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: usersRepository,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('successfully registers a new user with hashed password and returns token', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);
      (usersRepository.create as jest.Mock).mockImplementation((dto) => ({
        ...dto,
        id: '22222222-2222-2222-2222-222222222222',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      (usersRepository.save as jest.Mock).mockImplementation((u) =>
        Promise.resolve(u),
      );
      jest
        .spyOn(bcrypt, 'hash')
        .mockImplementation(() => Promise.resolve('hashed-secret') as any);

      const result = await service.register({
        name: 'New User',
        email: 'newuser@crm.local',
        password: 'Password123!',
      });

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'newuser@crm.local' },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New User',
          email: 'newuser@crm.local',
          passwordHash: 'hashed-secret',
          role: UserRole.SALES,
          status: UserStatus.ACTIVE,
        }),
      );
      expect(result.accessToken).toBe('mock-jwt-token-xyz');
      expect(result.tokenType).toBe('Bearer');
      expect(result.user.email).toBe('newuser@crm.local');
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('throws ConflictException if email is already taken', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.register({
          name: 'Duplicate User',
          email: 'sales@crm.local',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('registers user with specified role when provided', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);
      (usersRepository.create as jest.Mock).mockImplementation((dto) => ({
        ...dto,
        id: 'admin-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      (usersRepository.save as jest.Mock).mockImplementation((u) =>
        Promise.resolve(u),
      );
      jest
        .spyOn(bcrypt, 'hash')
        .mockImplementation(() => Promise.resolve('hashed-admin') as any);

      const result = await service.register({
        name: 'Admin User',
        email: 'admin@crm.local',
        password: 'AdminPassword123!',
        role: UserRole.ADMIN,
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.ADMIN,
        }),
      );
      expect(result.user.role).toBe(UserRole.ADMIN);
    });
  });

  describe('login', () => {
    it('successfully logs in with valid credentials, updates lastLoginAt, and returns token', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue({ ...mockUser });
      (usersRepository.save as jest.Mock).mockImplementation((u) =>
        Promise.resolve(u),
      );
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(true) as any);

      const result = await service.login({
        email: 'sales@crm.local',
        password: 'Password123!',
      });

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'sales@crm.local' },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'Password123!',
        mockUser.passwordHash,
      );
      expect(usersRepository.save).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock-jwt-token-xyz');
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('throws UnauthorizedException when email does not exist', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@crm.local',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password does not match', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue({ ...mockUser });
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(false) as any);

      await expect(
        service.login({
          email: 'sales@crm.local',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user account is LOCKED or INACTIVE', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue({
        ...mockUser,
        status: UserStatus.LOCKED,
      });
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(() => Promise.resolve(true) as any);

      await expect(
        service.login({
          email: 'sales@crm.local',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('returns sanitized user profile when user exists', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue({ ...mockUser });

      const result = await service.getProfile(mockUser.id);

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('throws NotFoundException when user does not exist', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
