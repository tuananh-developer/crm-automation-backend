import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import type { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';

describe('NotificationsController authorization', () => {
  const service = {
    findForUser: jest.fn(),
    countUnread: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
  };
  const controller = new NotificationsController(
    service as unknown as NotificationsService,
  );

  const user = (id: string, role: UserRole): AuthenticatedUser => ({
    id,
    name: 'CRM User',
    email: 'user@example.test',
    role,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeEach(() => jest.clearAllMocks());

  it('allows Sales users to read and mutate only their own inbox', async () => {
    const salesUser = user('sales-user-id', UserRole.SALES);
    const query = { userId: salesUser.id };
    const dto = { userId: salesUser.id };

    await controller.findAll(query, salesUser);
    await controller.unreadCount(salesUser.id, salesUser);
    await controller.markAllRead(dto, salesUser);
    await controller.markRead('notification-id', dto, salesUser);

    expect(service.findForUser).toHaveBeenCalledWith(query);
    expect(service.countUnread).toHaveBeenCalledWith(salesUser.id);
    expect(service.markAllRead).toHaveBeenCalledWith(salesUser.id);
    expect(service.markRead).toHaveBeenCalledWith(
      'notification-id',
      salesUser.id,
    );
  });

  it('rejects Sales requests that target another user inbox', async () => {
    const salesUser = user('sales-user-id', UserRole.SALES);
    const otherUserId = 'another-user-id';

    expect(() =>
      controller.findAll({ userId: otherUserId }, salesUser),
    ).toThrow(ForbiddenException);
    await expect(
      controller.unreadCount(otherUserId, salesUser),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.markAllRead({ userId: otherUserId }, salesUser),
    ).rejects.toThrow(ForbiddenException);
    expect(() =>
      controller.markRead(
        'notification-id',
        { userId: otherUserId },
        salesUser,
      ),
    ).toThrow(ForbiddenException);
    expect(service.findForUser).not.toHaveBeenCalled();
    expect(service.countUnread).not.toHaveBeenCalled();
    expect(service.markAllRead).not.toHaveBeenCalled();
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it('allows Admin users to access a selected inbox', async () => {
    const adminUser = user('admin-user-id', UserRole.ADMIN);
    const selectedInbox = { userId: 'sales-user-id' };

    await controller.findAll(selectedInbox, adminUser);

    expect(service.findForUser).toHaveBeenCalledWith(selectedInbox);
  });
});
