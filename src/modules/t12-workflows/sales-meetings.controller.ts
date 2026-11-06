import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import {
  ConfirmMeetingActionItemDto,
  StartSalesMeetingDto,
} from './dto/index.js';
import { SalesMeetingsService } from './sales-meetings.service.js';

@ApiTags('Sales Meetings')
@Controller('sales-meetings')
@UseGuards(JwtAuthGuard)
export class SalesMeetingsController {
  constructor(private readonly service: SalesMeetingsService) {}

  @Get(':meetingId')
  @ApiOperation({
    summary:
      'Read a meeting, redacted transcript metadata, summary and action items',
  })
  getMeeting(
    @Param('meetingId', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getForUser(id, actor);
  }

  @Patch('action-items/:actionItemId/confirmation')
  @ApiOperation({
    summary: 'Confirm or reject an AI-proposed meeting action item',
  })
  confirmActionItem(
    @Param('actionItemId', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmMeetingActionItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.confirmActionItem(id, dto, actor);
  }

  @Post('requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a sales meeting summary and action-item workflow',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: StartSalesMeetingDto })
  request(
    @Body() dto: StartSalesMeetingDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.request(dto, actor, key);
  }
}
