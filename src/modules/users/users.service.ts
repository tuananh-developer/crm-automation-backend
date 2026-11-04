import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { User } from './entities/user.entity.js';
import { UserRole, UserStatus } from './enums/user.enum.js';
import type { CreateUserDto, UpdateUserDto } from './dto/index.js';
import type { SafeUser } from './interfaces/index.js';

export type { SafeUser };
export type UserAssignee = Pick<User, 'id' | 'name' | 'role'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<SafeUser[]> {
    const users = await this.usersRepository.find({ order: { name: 'ASC' } });
    return users.map((user) => this.safe(user));
  }

  async findAssignees(): Promise<UserAssignee[]> {
    return this.usersRepository.find({
      select: { id: true, name: true, role: true },
      where: { status: UserStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<SafeUser> {
    return this.safe(await this.getUser(id));
  }

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
  ): Promise<SafeUser> {
    const email = dto.email.trim().toLowerCase();
    if (await this.usersRepository.findOne({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const user = repo.create({
        name: dto.name.trim(),
        email,
        passwordHash,
        role: dto.role,
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
      });
      user.passwordHash = passwordHash;
      const saved = await this.saveUserOrConflict(repo, user);
      await this.writeAudit(
        manager.getRepository(AuditLog),
        actor,
        saved.id,
        'USER_CREATED',
        null,
        {
          name: saved.name,
          email: saved.email,
          role: saved.role,
          status: saved.status,
        },
      );
      return this.safe(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<SafeUser> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const user = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException(`User ${id} not found`);
      if (
        actor.id === id &&
        (dto.role !== undefined || dto.status !== undefined)
      ) {
        throw new ForbiddenException(
          'You cannot change your own role or status',
        );
      }
      const nextRole = dto.role ?? user.role;
      const nextStatus = dto.status ?? user.status;
      const nextEmail = dto.email?.trim().toLowerCase() ?? user.email;
      if (nextEmail !== user.email) {
        const existing = await repo.findOne({ where: { email: nextEmail } });
        if (existing && existing.id !== id) {
          throw new ConflictException('A user with this email already exists');
        }
      }
      await this.assertAdminRemains(repo, user, nextRole, nextStatus);
      const oldValue = {
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      };
      if (dto.name !== undefined) user.name = dto.name.trim();
      user.email = nextEmail;
      user.role = nextRole;
      user.status = nextStatus;
      const saved = await this.saveUserOrConflict(repo, user);
      await this.writeAudit(
        manager.getRepository(AuditLog),
        actor,
        id,
        'USER_UPDATED',
        oldValue,
        {
          name: saved.name,
          email: saved.email,
          role: saved.role,
          status: saved.status,
        },
      );
      return this.safe(saved);
    });
  }

  async disable(id: string, actor: AuthenticatedUser): Promise<SafeUser> {
    if (actor.id === id)
      throw new ForbiddenException('You cannot disable your own account');
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const user = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException(`User ${id} not found`);
      const oldValue = { status: user.status };

      // Validate before mutating: the last active Admin must not be removed.
      await this.assertAdminRemains(repo, user, user.role, UserStatus.INACTIVE);

      user.status = UserStatus.INACTIVE;
      const saved = await repo.save(user);
      await this.writeAudit(
        manager.getRepository(AuditLog),
        actor,
        id,
        'USER_DISABLED',
        oldValue,
        { status: saved.status },
      );
      return this.safe(saved);
    });
  }

  private async assertAdminRemains(
    repo: Repository<User>,
    target: User,
    role: UserRole,
    status: UserStatus,
  ): Promise<void> {
    if (
      target.role !== UserRole.ADMIN ||
      target.status !== UserStatus.ACTIVE ||
      (role === UserRole.ADMIN && status === UserStatus.ACTIVE)
    )
      return;
    await repo.find({
      select: { id: true },
      where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const count = await repo.count({
      where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    });
    if (count <= 1)
      throw new ConflictException(
        'Cannot remove or deactivate the last active Admin',
      );
  }

  private async getUser(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  private safe(user: User): SafeUser {
    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return safeUser;
  }

  private async saveUserOrConflict(
    repo: Repository<User>,
    user: User,
  ): Promise<User> {
    try {
      return await repo.save(user);
    } catch (error) {
      const driverError =
        typeof error === 'object' && error !== null && 'driverError' in error
          ? error.driverError
          : undefined;
      const code =
        typeof driverError === 'object' &&
        driverError !== null &&
        'code' in driverError
          ? driverError.code
          : undefined;

      if (code === '23505') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  private async writeAudit(
    repo: Repository<AuditLog>,
    actor: AuthenticatedUser,
    id: string,
    action: string,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown>,
  ): Promise<void> {
    await repo.save({
      userId: actor.id,
      entityType: 'User',
      entityId: id,
      action,
      oldValue,
      newValue,
      metadata: null,
      ipAddress: null,
      userAgent: null,
    });
  }
}
