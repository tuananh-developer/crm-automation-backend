import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { MarkNotificationReadDto, QueryNotificationsDto } from './dto/index.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@Query() query: QueryNotificationsDto) {
    return this.notificationsService.findForUser(query);
  }

  @Get('unread-count')
  async unreadCount(@Query('userId', ParseUUIDPipe) userId: string) {
    return { count: await this.notificationsService.countUnread(userId) };
  }

  @Patch('read-all')
  async markAllRead(@Body() dto: MarkNotificationReadDto) {
    const updated = await this.notificationsService.markAllRead(dto.userId);

    return { updated };
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkNotificationReadDto,
  ) {
    return this.notificationsService.markRead(id, dto.userId);
  }
  @Post('internal/create')
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInternal(@Body() dto: CreateNotificationDto) {
    const notification = await this.notificationsService.create({
      userId: dto.userId || '00000000-0000-0000-0000-000000000000',
      type: dto.type,
      title: dto.title,
      content: dto.message,
      leadId: null,
      customerId: null,
      reviewTaskId: null,
    });
    return { notificationId: notification.id, status: 'CREATED' };
  }
}
