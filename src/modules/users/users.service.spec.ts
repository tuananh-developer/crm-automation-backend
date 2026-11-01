import { ConflictException, ForbiddenException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { User } from './entities/user.entity.js';
import { UserRole, UserStatus } from './enums/user.enum.js';
import { UsersService } from './users.service.js';

describe('UsersService administration', () => {
  let service: UsersService;
  let users: jest.Mocked<Partial<Repository<User>>>;
  let audit: jest.Mocked<Partial<Repository<AuditLog>>>;
  let source: jest.Mocked<Partial<DataSource>>;
  let actor: AuthenticatedUser;
  let usersFind: jest.Mock;
  let usersFindOne: jest.Mock;
  let usersCreate: jest.Mock;
  let usersSave: jest.Mock;
  let usersCount: jest.Mock;
  let auditSave: jest.Mock;
  const admin = (id: string): User => ({
    id,
    name: 'Admin',
    email: `${id}@crm.local`,
    passwordHash: 'hash',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    actor = { ...admin('actor'), status: UserStatus.ACTIVE };
    usersFind = jest.fn().mockResolvedValue([]);
    usersFindOne = jest.fn();
    usersCreate = jest.fn((value) => value as User);
    usersSave = jest.fn((value) => Promise.resolve(value as User));
    usersCount = jest.fn().mockResolvedValue(2);
    auditSave = jest.fn((value) => Promise.resolve(value as AuditLog));
    users = {
      find: usersFind,
      findOne: usersFindOne,
      create: usersCreate,
      save: usersSave,
      count: usersCount,
    };
    audit = { save: auditSave };
    const manager = {
      getRepository: jest.fn((entity) => (entity === User ? users : audit)),
    };
    const transaction = jest.fn((fn: (manager: never) => Promise<unknown>) =>
      fn(manager as never),
    );
    source = { transaction } as unknown as jest.Mocked<Partial<DataSource>>;
    service = new UsersService(users as Repository<User>, source as DataSource);
  });

  it('returns only active id/name/role in the assignee directory', async () => {
    usersFind.mockResolvedValue([{ id: 'u', name: 'A', role: UserRole.SALES }]);
    await expect(service.findAssignees()).resolves.toEqual([
      { id: 'u', name: 'A', role: UserRole.SALES },
    ]);
    expect(usersFind).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, role: true },
        where: { status: UserStatus.ACTIVE },
      }),
    );
  });

  it('hashes created passwords and audits only non-secret fields', async () => {
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);
    usersFindOne.mockResolvedValue(null);
    const result = await service.create(
      {
        name: ' New User ',
        email: ' NEW@CRM.LOCAL ',
        password: 'very-secret-password',
        role: UserRole.SALES,
      },
      actor,
    );
    expect(bcrypt.hash).toHaveBeenCalledWith('very-secret-password', 10);
    expect(result).not.toHaveProperty('passwordHash');
    expect(auditSave).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_CREATED',
        newValue: expect.objectContaining({ email: 'new@crm.local' }),
      }),
    );
    expect(JSON.stringify(auditSave.mock.calls)).not.toContain(
      'very-secret-password',
    );
    expect(JSON.stringify(auditSave.mock.calls)).not.toContain('new-hash');
    jest.restoreAllMocks();
  });

  it('rejects duplicate email', async () => {
    usersFindOne.mockResolvedValue(admin('existing'));
    await expect(
      service.create(
        {
          name: 'A',
          email: 'EXISTING@CRM.LOCAL',
          password: 'long-password-here',
          role: UserRole.SALES,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a concurrent email unique-constraint violation to Conflict', async () => {
    usersFindOne.mockResolvedValue(null);
    usersSave.mockRejectedValue({ driverError: { code: '23505' } });

    await expect(
      service.create(
        {
          name: 'A',
          email: 'new@crm.local',
          password: 'long-password-here',
          role: UserRole.SALES,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents self role/status changes', async () => {
    usersFindOne.mockResolvedValue(admin(actor.id));
    await expect(
      service.update(actor.id, { role: UserRole.SALES }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('audits permitted updates without copying credential data', async () => {
    usersFindOne.mockResolvedValue(admin('target'));
    await service.update('target', { name: 'Changed' }, actor);
    expect(auditSave).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_UPDATED',
        oldValue: expect.objectContaining({ role: UserRole.ADMIN }),
        newValue: expect.objectContaining({ name: 'Changed' }),
      }),
    );
    expect(JSON.stringify(auditSave.mock.calls)).not.toContain('passwordHash');
  });

  it('prevents self-disable', async () => {
    await expect(service.disable(actor.id, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('prevents removing the last active Admin', async () => {
    const onlyAdmin = admin('target');
    usersFindOne.mockResolvedValue(onlyAdmin);
    usersCount.mockResolvedValue(1);
    await expect(service.disable('target', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(usersSave).not.toHaveBeenCalled();
  });

  it('allows an Admin to reactivate an account with an audited status change', async () => {
    usersFindOne.mockResolvedValue({
      ...admin('target'),
      status: UserStatus.INACTIVE,
    });
    const result = await service.update(
      'target',
      { status: UserStatus.ACTIVE },
      actor,
    );
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(auditSave).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: expect.objectContaining({ status: UserStatus.INACTIVE }),
        newValue: expect.objectContaining({ status: UserStatus.ACTIVE }),
      }),
    );
  });
});
