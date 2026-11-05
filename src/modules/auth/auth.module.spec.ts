import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity.js';
import { AuthModule } from './auth.module.js';

describe('AuthModule', () => {
  it('compiles successfully in development environment with fallback secret', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ NODE_ENV: 'test' })],
        }),
        AuthModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue({ findOne: jest.fn(), create: jest.fn(), save: jest.fn() })
      .compile();

    expect(module).toBeDefined();
    expect(module.get(AuthModule)).toBeInstanceOf(AuthModule);
  });

  it('compiles successfully with configured JWT_SECRET', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'production',
              JWT_SECRET: 'production-secret-at-least-32-chars-long',
              JWT_EXPIRES_IN_SECONDS: 3600,
            }),
          ],
        }),
        AuthModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue({ findOne: jest.fn(), create: jest.fn(), save: jest.fn() })
      .compile();

    expect(module).toBeDefined();
    expect(module.get(AuthModule)).toBeInstanceOf(AuthModule);
  });

  it('fails to compile in production when JWT_SECRET is missing', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ NODE_ENV: 'production' })],
          }),
          AuthModule,
        ],
      })
        .overrideProvider(getRepositoryToken(User))
        .useValue({ findOne: jest.fn(), create: jest.fn(), save: jest.fn() })
        .compile(),
    ).rejects.toThrow(
      'FATAL: JWT_SECRET environment variable is missing in production environment',
    );
  });
});
