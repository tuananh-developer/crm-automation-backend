import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../../../common/types/auth.interface.js';
import { User } from '../../users/entities/user.entity.js';
import { UserStatus } from '../../users/enums/user.enum.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {
    const isProduction =
      configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (isProduction && !jwtSecret) {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is missing in production environment',
      );
    }

    if (!jwtSecret) {
      new Logger(JwtStrategy.name).warn(
        'JWT_SECRET is not configured; using insecure fallback development secret. Set JWT_SECRET in production!',
      );
    }

    const secret =
      jwtSecret || 'crm-jwt-secret-key-super-secure-change-in-production';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        `User account is ${user.status.toLowerCase()} and cannot authenticate`,
      );
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
