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

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;
  private readonly expiresInSeconds = 86400; // 24 hours

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user with bcrypt password hashing and emit JWT token.
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(
        `User with email '${dto.email}' already exists`,
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

    const savedUser = await this.usersRepository.save(user);
    const token = this.generateToken(savedUser);

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds,
      user: this.sanitizeUser(savedUser),
    };
  }

  /**
   * Authenticate an existing user with constant-time password verification.
   */
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

    const token = this.generateToken(updatedUser);

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds,
      user: this.sanitizeUser(updatedUser),
    };
  }

  /**
   * Fetch current authenticated user profile without exposing password hashes.
   */
  async getProfile(userId: string): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found`);
    }

    return this.sanitizeUser(user);
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
