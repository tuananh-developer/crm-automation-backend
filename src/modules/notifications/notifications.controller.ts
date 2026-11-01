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
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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

  @Get()
  @ApiOperation({ summary: 'Find notifications for a user' })
  findAll(@Query() query: QueryNotificationsDto) {
    return this.notificationsService.findForUser(query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for a user' })
  async unreadCount(@Query('userId', ParseUUIDPipe) userId: string) {
    return { count: await this.notificationsService.countUnread(userId) };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for a user' })
  async markAllRead(@Body() dto: MarkNotificationReadDto) {
    const updated = await this.notificationsService.markAllRead(dto.userId);

    return { updated };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark specific notification as read' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkNotificationReadDto,
  ) {
    return this.notificationsService.markRead(id, dto.userId);
  }

  @Post('internal/create')
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Internal notification creation endpoint for workflows/services',
  })
  @ApiBody({ type: CreateInternalNotificationDto })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully.',
  })
  async createInternal(@Body() dto: CreateInternalNotificationDto) {
    return this.notificationsService.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      content: dto.message ?? dto.content,
      severity: dto.severity,
      leadId: dto.leadId,
      customerId: dto.customerId,
      reviewTaskId: dto.reviewTaskId,
    });
  }
}
