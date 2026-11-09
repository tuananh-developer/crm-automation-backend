import { CustomersController } from './customers.controller.js';
import type { CustomersService } from './customers.service.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';

describe('CustomersController actor forwarding', () => {
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findChurnAssessments: jest.fn(),
  };
  const controller = new CustomersController(
    service as unknown as CustomersService,
  );
  const actor: AuthenticatedUser = {
    id: 'sales-user-id',
    name: 'Sales User',
    email: 'sales@example.test',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => jest.clearAllMocks());

  it('passes the authenticated actor to customer list and detail reads', async () => {
    const query = { page: 1, limit: 10 };

    await controller.findAll(query, actor);
    await controller.findOne('customer-1', actor);

    expect(service.findAll).toHaveBeenCalledWith(query, actor);
    expect(service.findOne).toHaveBeenCalledWith('customer-1', actor);
  });

  it('passes the authenticated actor to churn assessment history reads', async () => {
    await controller.findChurnAssessments('customer-1', actor);

    expect(service.findChurnAssessments).toHaveBeenCalledWith(
      'customer-1',
      actor,
    );
  });
});
