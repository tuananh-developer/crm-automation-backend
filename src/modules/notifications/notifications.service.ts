import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import {
  DEFAULT_NOTIFICATION_LIMIT,
  QueryNotificationsDto,
} from './dto/index.js';
import { NotificationSeverity } from './enums/notification.enum.js';
import type { CreateNotificationInput } from './interfaces/index.js';
import {
  hasSamePayload,
  isPostgresUniqueViolation,
} from '../../common/utils/idempotency.util.js';

export type { CreateNotificationInput };

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @Optional()
    @InjectRepository(User)
    private readonly usersRepository?: Repository<User>,
    @Optional()
    @InjectRepository(Lead)
    private readonly leadsRepository?: Repository<Lead>,
  ) {}

  async findForUser(query: QueryNotificationsDto): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: {
        userId: query.userId,
        ...(query.unreadOnly ? { isRead: false } : {}),
      },
      order: { createdAt: 'DESC' },
      take: query.limit ?? DEFAULT_NOTIFICATION_LIMIT,
    });
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return notification;
    }

    notification.isRead = true;
    notification.readAt = new Date();

    return this.notificationRepository.save(notification);
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    return result.affected ?? 0;
  }

  /** Used by other modules (UC06, UC07) to raise an in-app notification. */
  async create(input: CreateNotificationInput): Promise<Notification> {
    let targetUserId = input.userId;

    if (!targetUserId && input.leadId && this.leadsRepository) {
      const lead = await this.leadsRepository.findOne({
        where: { id: input.leadId },
      });
      if (lead?.ownerId) {
        targetUserId = lead.ownerId;
      }
    }

    if (!targetUserId) {
      throw new BadRequestException(
        'Notification recipient userId is required and could not be resolved from lead owner',
      );
    }

    const payload = {
      userId: targetUserId,
      type: input.type,
      title: input.title,
      content: input.content ?? input.message ?? null,
      leadId: input.leadId ?? null,
      customerId: input.customerId ?? null,
      reviewTaskId: input.reviewTaskId ?? null,
      severity: input.severity ?? NotificationSeverity.INFO,
    };

    const idempotencyKey = input.idempotencyKey?.trim() || null;
    const findExisting = () =>
      idempotencyKey
        ? this.notificationRepository.findOne({ where: { idempotencyKey } })
        : Promise.resolve(null);

    const reuseExisting = (existing: Notification) => {
      const existingPayload = {
        userId: existing.userId,
        type: existing.type,
        title: existing.title,
        content: existing.content,
        leadId: existing.leadId,
        customerId: existing.customerId,
        reviewTaskId: existing.reviewTaskId,
        severity: existing.severity ?? NotificationSeverity.INFO,
      };
      if (!hasSamePayload(existingPayload, payload)) {
        throw new ConflictException(
          'Idempotency key was already used with a different notification payload',
        );
      }
      return existing;
    };

    const existing = await findExisting();
    if (existing) {
      return reuseExisting(existing);
    }

    try {
      return await this.notificationRepository.save(
        this.notificationRepository.create({
          ...payload,
          idempotencyKey,
          isRead: false,
          readAt: null,
        }),
      );
    } catch (error) {
      if (!idempotencyKey || !isPostgresUniqueViolation(error)) {
        throw error;
      }
      const concurrent = await findExisting();
      if (!concurrent) {
        throw error;
      }
      return reuseExisting(concurrent);
    }
  }
}
