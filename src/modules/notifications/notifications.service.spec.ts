import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationType } from './enums/notification.enum.js';
import type { Repository } from 'typeorm';
import type { Notification } from './entities/notification.entity.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepository: jest.Mocked<Partial<Repository<Notification>>>;

  const mockNotification: Notification = {
    id: 'notification-1',
    userId: 'user-1',
    type: NotificationType.HUMAN_REVIEW_REQUIRED,
    title: 'Human review required',
    content: 'Lead lead-1 requires manual review.',
    leadId: 'lead-1',
    customerId: null,
    reviewTaskId: 'review-1',
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
  };

  beforeEach(() => {
    notificationRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    service = new NotificationsService(
      notificationRepository as Repository<Notification>,
    );
  });

  it('lists notifications of one user, newest first', async () => {
    (notificationRepository.find as jest.Mock).mockResolvedValue([
      mockNotification,
    ]);

    const result = await service.findForUser({ userId: 'user-1', limit: 10 });

    expect(notificationRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    expect(result).toHaveLength(1);
  });

  it('filters unread notifications only', async () => {
    (notificationRepository.find as jest.Mock).mockResolvedValue([
      mockNotification,
    ]);

    await service.findForUser({ userId: 'user-1', unreadOnly: true });

    expect(notificationRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', isRead: false },
      }),
    );
  });

  it('falls back to the default limit', async () => {
    (notificationRepository.find as jest.Mock).mockResolvedValue([]);

    await service.findForUser({ userId: 'user-1' });

    expect(notificationRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it('counts unread notifications of one user', async () => {
    (notificationRepository.count as jest.Mock).mockResolvedValue(3);

    await expect(service.countUnread('user-1')).resolves.toBe(3);
    expect(notificationRepository.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
    });
  });

  it('marks a notification as read with a timestamp', async () => {
    (notificationRepository.findOne as jest.Mock).mockResolvedValue({
      ...mockNotification,
    });
    (notificationRepository.save as jest.Mock).mockImplementation(
      (notification: Notification) => Promise.resolve(notification),
    );

    const result = await service.markRead('notification-1', 'user-1');

    expect(notificationRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: 'user-1' },
    });
    expect(result.isRead).toBe(true);
    expect(result.readAt).toBeInstanceOf(Date);
  });

  it('does not touch an already read notification', async () => {
    (notificationRepository.findOne as jest.Mock).mockResolvedValue({
      ...mockNotification,
      isRead: true,
      readAt: new Date('2026-10-03T00:00:00.000Z'),
    });

    const result = await service.markRead('notification-1', 'user-1');

    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(result.isRead).toBe(true);
  });

  it('rejects a notification that belongs to another user', async () => {
    (notificationRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      service.markRead('notification-1', 'user-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks every unread notification of a user', async () => {
    (notificationRepository.update as jest.Mock).mockResolvedValue({
      affected: 4,
    });

    await expect(service.markAllRead('user-1')).resolves.toBe(4);
    expect(notificationRepository.update).toHaveBeenCalledWith(
      { userId: 'user-1', isRead: false },
      { isRead: true, readAt: expect.any(Date) },
    );
  });

  it('creates an unread notification', async () => {
    (notificationRepository.create as jest.Mock).mockImplementation(
      (input: Partial<Notification>) => input as Notification,
    );
    (notificationRepository.save as jest.Mock).mockImplementation(
      (notification: Notification) => Promise.resolve(notification),
    );

    const result = await service.create({
      userId: 'user-1',
      type: NotificationType.FOLLOW_UP_FAILED,
      title: 'Follow-up failed',
      leadId: 'lead-1',
    });

    expect(result.isRead).toBe(false);
    expect(result.readAt).toBeNull();
    expect(result.type).toBe(NotificationType.FOLLOW_UP_FAILED);
  });
});
