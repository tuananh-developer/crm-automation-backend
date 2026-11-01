import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import {
  CreateNotificationDto,
  MarkNotificationReadDto,
  QueryNotificationsDto,
  NotificationResponseDto,
} from './dto/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertInboxAccess(query.userId, user);
    return this.notificationsService.findForUser(query);
  }

  @Get('unread-count')
  async unreadCount(
    @Query('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertInboxAccess(userId, user);
    return { count: await this.notificationsService.countUnread(userId) };
  }

  @Patch('read-all')
  async markAllRead(
    @Body() dto: MarkNotificationReadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertInboxAccess(dto.userId, user);
    const updated = await this.notificationsService.markAllRead(dto.userId);

    return { updated };
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkNotificationReadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertInboxAccess(dto.userId, user);
    return this.notificationsService.markRead(id, dto.userId);
  }

  /**
   * Internal endpoint used by n8n workflows (WF01/WF08/WF10/WF11/WF12) to
   * raise an in-app notification after the caller has been authorized and
   * correlated through the backend. Browsers never call this directly.
   */
  @Post('internal/create')
  @HttpCode(HttpStatus.OK)
  @UseGuards(N8nAuthGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Create an in-app notification from an authorized n8n workflow',
    description:
      'Canonical route: /api/v1/notifications/internal/create. n8n workflows request an idempotent backend notification through this endpoint. The backend validates the target user, type and resource references.',
  })
  @ApiBody({ type: CreateNotificationDto })
  @ApiResponse({
    status: 200,
    description: 'Notification created.',
    type: NotificationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized n8n callback.' })
  async createInternal(
    @Body() dto: CreateNotificationDto,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      content: dto.content ?? null,
      leadId: dto.leadId ?? null,
      customerId: dto.customerId ?? null,
      reviewTaskId: dto.reviewTaskId ?? null,
    });

    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      leadId: notification.leadId,
      customerId: notification.customerId,
      reviewTaskId: notification.reviewTaskId,
      isRead: notification.isRead,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }

  private assertInboxAccess(
    requestedUserId: string,
    user: AuthenticatedUser,
  ): void {
    if (user.role !== UserRole.ADMIN && requestedUserId !== user.id) {
      throw new ForbiddenException(
        'You may only access your own notifications',
      );
    }
  }
}
