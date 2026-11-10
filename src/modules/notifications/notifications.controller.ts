import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { MarkNotificationReadDto, QueryNotificationsDto } from './dto/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole } from '../users/enums/user.enum.js';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const userId = this.resolveInboxUserId(query.userId, actor);
    return this.notificationsService.findForUser({ ...query, userId });
  }

  @Get('unread-count')
  async unreadCount(
    @Query('userId', new ParseUUIDPipe({ optional: true }))
    userId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const targetUserId = this.resolveInboxUserId(userId, actor);
    return {
      count: await this.notificationsService.countUnread(targetUserId),
    };
  }

  @Patch('read-all')
  async markAllRead(
    @Body() dto: MarkNotificationReadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const userId = this.resolveInboxUserId(dto.userId, actor);
    const updated = await this.notificationsService.markAllRead(userId);

    return { updated };
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkNotificationReadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const userId = this.resolveInboxUserId(dto.userId, actor);
    return this.notificationsService.markRead(id, userId);
  }

  @Post('internal/create')
  @Public()
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInternal(@Body() dto: CreateNotificationDto) {
    const notification = await this.notificationsService.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      content: dto.message,
      leadId: null,
      customerId: null,
      reviewTaskId: null,
      idempotencyKey: dto.idempotencyKey,
    });
    return { notificationId: notification.id, status: 'CREATED' };
  }

  private resolveInboxUserId(
    requestedUserId: string | undefined,
    actor: AuthenticatedUser | undefined,
  ): string {
    if (!actor?.id || !actor.role) {
      throw new UnauthorizedException('Authenticated actor is required');
    }
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SALES) {
      throw new ForbiddenException('Role cannot access notifications');
    }
    if (actor.role === UserRole.SALES) {
      if (requestedUserId && requestedUserId !== actor.id) {
        throw new ForbiddenException(
          'Sales users may only access their own notifications',
        );
      }
      return actor.id;
    }
    if (!requestedUserId) {
      throw new BadRequestException('userId is required for Admin access');
    }
    return requestedUserId;
  }
}
