import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  DEFAULT_NOTIFICATION_LIMIT,
  QueryNotificationsDto,
} from './dto/index.js';
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
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findForUser(
    query: QueryNotificationsDto & { userId: string },
  ): Promise<Notification[]> {
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
    if (!input.userId?.trim()) {
      throw new BadRequestException('Notification userId is required');
    }
    const payload = {
      userId: input.userId,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      leadId: input.leadId ?? null,
      customerId: input.customerId ?? null,
      reviewTaskId: input.reviewTaskId ?? null,
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
      };
      if (!hasSamePayload(existingPayload, payload))
        throw new ConflictException(
          'Idempotency key was already used with a different notification payload',
        );
      return existing;
    };
    const existing = await findExisting();
    if (existing) return reuseExisting(existing);
    const user = await this.usersRepository.findOne({
      where: { id: input.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID '${input.userId}' not found`);
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
      if (!idempotencyKey || !isPostgresUniqueViolation(error)) throw error;
      const concurrent = await findExisting();
      if (!concurrent) throw error;
      return reuseExisting(concurrent);
    }
  }
}
