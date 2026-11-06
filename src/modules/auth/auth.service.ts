import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/auth.interface.js';
import { User } from '../users/entities/user.entity.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { parseJwtExpiresInSeconds } from './jwt-expiration.util.js';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private get expiresInSeconds(): number {
    return parseJwtExpiresInSeconds(
      this.configService.get<string | number>('JWT_EXPIRES_IN_SECONDS'),
    );
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(
        'A user with this email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);
    const user = this.usersRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
      lastLoginAt: new Date(),
    });

    let savedUser: User;
    try {
      savedUser = await this.usersRepository.save(user);
    } catch (error: unknown) {
      const databaseError = error as {
        code?: string;
        driverError?: { code?: string };
      };
      if (
        databaseError.code === '23505' ||
        databaseError.driverError?.code === '23505'
      ) {
        throw new ConflictException(
          'A user with this email already exists',
        );
      }
      throw error;
    }

    return {
      accessToken: this.generateToken(savedUser),
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds,
      user: this.sanitizeUser(savedUser),
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        `User account is ${user.status.toLowerCase()}`,
      );
    }

    user.lastLoginAt = new Date();
    const updatedUser = await this.usersRepository.save(user);
    return {
      accessToken: this.generateToken(updatedUser),
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds,
      user: this.sanitizeUser(updatedUser),
    };
  }

  getProfile(userId: string): Promise<AuthenticatedUser> {
    return this.usersRepository.findOne({ where: { id: userId } }).then((user) => {
      if (!user) {
        throw new NotFoundException(`User with ID '${userId}' not found`);
      }
      return this.sanitizeUser(user);
    });
  }

  private generateToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: User): AuthenticatedUser {
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
