import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
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
}
