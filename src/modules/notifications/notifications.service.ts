import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { NotificationType } from './enums/notification.enum.js';
import {
  DEFAULT_NOTIFICATION_LIMIT,
  QueryNotificationsDto,
} from './dto/index.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType | string;
  title: string;
  content?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  reviewTaskId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
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
    return this.notificationRepository.save(
      this.notificationRepository.create({
        userId: input.userId,
        type: input.type,
        title: input.title,
        content: input.content ?? null,
        leadId: input.leadId ?? null,
        customerId: input.customerId ?? null,
        reviewTaskId: input.reviewTaskId ?? null,
        isRead: false,
        readAt: null,
      }),
    );
  }
}
