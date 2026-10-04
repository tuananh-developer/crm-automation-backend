import { UsersService } from './users.service.js';
import { UserRole, UserStatus } from './enums/user.enum.js';
import type { Repository } from 'typeorm';
import type { User } from './entities/user.entity.js';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<Partial<Repository<User>>>;

  const mockUser: User = {
    id: 'user-1',
    name: 'Sales Reviewer',
    email: 'reviewer@crm.local',
    passwordHash: 'super-secret-hash',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
    updatedAt: new Date('2026-10-03T00:00:00.000Z'),
  };

  beforeEach(() => {
    usersRepository = {
      find: jest.fn(),
    };

    service = new UsersService(usersRepository as Repository<User>);
  });

  it('lists users ordered by name without password hashes', async () => {
    (usersRepository.find as jest.Mock).mockResolvedValue([mockUser]);

    const result = await service.findAll();

    expect(usersRepository.find).toHaveBeenCalledWith({
      order: { name: 'ASC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sales Reviewer');
    expect(result[0]).not.toHaveProperty('passwordHash');
  });

  it('returns an empty list when there is no user', async () => {
    (usersRepository.find as jest.Mock).mockResolvedValue([]);

    await expect(service.findAll()).resolves.toEqual([]);
  });
});
