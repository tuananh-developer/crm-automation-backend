import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import {
  CreateInternalNotificationDto,
  MarkNotificationReadDto,
  QueryNotificationsDto,
} from './dto/index.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('internal/create')
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Internal endpoint to create notification from n8n workflows',
  })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid notification data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized n8n request.' })
  async createInternal(@Body() dto: CreateInternalNotificationDto) {
    return this.notificationsService.create(dto);
  }

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
