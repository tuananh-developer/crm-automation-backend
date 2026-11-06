import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { User } from '../users/entities/user.entity.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { parseJwtExpiresInSeconds } from './jwt-expiration.util.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = (
          configService.get<string>('NODE_ENV') ||
          process.env.NODE_ENV ||
          ''
        ).toLowerCase();
        const isDevOrTest = ['development', 'test'].includes(nodeEnv);
        const jwtSecret = configService.get<string>('JWT_SECRET');

        if (!isDevOrTest && !jwtSecret) {
          throw new Error(
            `FATAL: JWT_SECRET environment variable is missing in ${nodeEnv || 'production'} environment`,
          );
        }

        if (!jwtSecret) {
          new Logger('AuthModule').warn(
            'JWT_SECRET is not configured; using insecure fallback development secret. Set JWT_SECRET in production!',
          );
        }

        return {
          secret:
            jwtSecret || 'crm-jwt-secret-key-super-secure-change-in-production',
          signOptions: {
            expiresIn: parseJwtExpiresInSeconds(
              configService.get<string | number>('JWT_EXPIRES_IN_SECONDS'),
            ),
          },
        };
      },
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtStrategy, JwtAuthGuard, PassportModule, JwtModule],
})
export class AuthModule {}
