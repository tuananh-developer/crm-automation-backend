import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import {
  NotificationSeverity,
  NotificationType,
} from './enums/notification.enum.js';
import type { Repository } from 'typeorm';
import type { Notification } from './entities/notification.entity.js';
import type { Lead } from '../leads/entities/lead.entity.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepository: jest.Mocked<Partial<Repository<Notification>>>;

  const mockNotification: Notification = {
    id: 'notification-1',
    userId: 'user-1',
    type: NotificationType.HUMAN_REVIEW_REQUIRED,
    title: 'Human review required',
    content: 'Lead lead-1 requires manual review.',
    severity: NotificationSeverity.INFO,
    leadId: 'lead-1',
    customerId: null,
    reviewTaskId: 'review-1',
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
    idempotencyKey: null,
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

  it('reuses an existing notification when the idempotency key and payload match', async () => {
    const existing = {
      ...mockNotification,
      idempotencyKey: 'wf08:run-1:user-1',
    };
    (notificationRepository.findOne as jest.Mock).mockResolvedValueOnce(
      existing,
    );
    const result = await service.create({
      userId: existing.userId,
      type: existing.type,
      title: existing.title,
      content: existing.content,
      leadId: existing.leadId,
      customerId: existing.customerId,
      reviewTaskId: existing.reviewTaskId,
      idempotencyKey: existing.idempotencyKey,
    });
    expect(result).toBe(existing);
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const existing = {
      ...mockNotification,
      idempotencyKey: 'wf08:run-1:user-1',
    };
    (notificationRepository.findOne as jest.Mock).mockResolvedValueOnce(
      existing,
    );
    await expect(
      service.create({
        userId: 'another-user',
        type: existing.type,
        title: existing.title,
        content: existing.content,
        leadId: existing.leadId,
        customerId: existing.customerId,
        reviewTaskId: existing.reviewTaskId,
        idempotencyKey: existing.idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
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

  it('resolves recipient userId from lead owner when userId is omitted', async () => {
    const leadsRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'lead-1', ownerId: 'owner-user-1' }),
    };
    const serviceWithLeads = new NotificationsService(
      notificationRepository as Repository<Notification>,
      undefined,
      leadsRepo as unknown as Repository<Lead>,
    );
    (notificationRepository.create as jest.Mock).mockImplementation(
      (input: Partial<Notification>) => input as Notification,
    );
    (notificationRepository.save as jest.Mock).mockImplementation(
      (notification: Notification) => Promise.resolve(notification),
    );

    const result = await serviceWithLeads.create({
      type: NotificationType.WORKFLOW_COMPLETED,
      title: 'Lead Enrichment Incomplete',
      leadId: 'lead-1',
    });

    expect(result.userId).toBe('owner-user-1');
  });

  it('throws BadRequestException when userId is omitted and lead has no owner', async () => {
    const leadsRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'lead-1', ownerId: null }),
    };
    const serviceWithLeads = new NotificationsService(
      notificationRepository as Repository<Notification>,
      undefined,
      leadsRepo as unknown as Repository<Lead>,
    );

    await expect(
      serviceWithLeads.create({
        type: NotificationType.WORKFLOW_COMPLETED,
        title: 'Lead Enrichment Incomplete',
        leadId: 'lead-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists explicit notification severity (HIGH / MEDIUM / INFO) end-to-end', async () => {
    (notificationRepository.create as jest.Mock).mockImplementation(
      (input: Partial<Notification>) => input as Notification,
    );
    (notificationRepository.save as jest.Mock).mockImplementation(
      (notification: Notification) => Promise.resolve(notification),
    );

    const highNotif = await service.create({
      userId: 'user-1',
      type: NotificationType.WORKFLOW_COMPLETED,
      severity: 'HIGH',
      title: 'Lead Enrichment Failed',
      message: 'Enrichment failed with error',
      leadId: 'lead-1',
    });

    expect(notificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'HIGH',
      }),
    );
    expect(highNotif.severity).toBe('HIGH');

    const mediumNotif = await service.create({
      userId: 'user-1',
      type: NotificationType.WORKFLOW_COMPLETED,
      severity: 'MEDIUM',
      title: 'Lead Enrichment Partial',
      message: 'Enrichment completed partially',
      leadId: 'lead-1',
    });

    expect(mediumNotif.severity).toBe('MEDIUM');

    const defaultNotif = await service.create({
      userId: 'user-1',
      type: NotificationType.WORKFLOW_COMPLETED,
      title: 'Default Severity Notification',
      leadId: 'lead-1',
    });

    expect(defaultNotif.severity).toBe('INFO');
  });
});
