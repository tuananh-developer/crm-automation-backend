import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CommunicationService } from './communication.service.js';
import { SendCommunicationDto } from './dto/send-communication.dto.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';

/**
 * Canonical internal route: /api/v1/internal/communication/send.
 * Protected by N8nAuthGuard; browsers never call this directly.
 */
@ApiTags('Internal n8n Webhooks')
@Controller('internal/communication')
@UseGuards(N8nAuthGuard)
export class InternalCommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Post('send')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a communication message on behalf of an n8n workflow',
    description:
      'Canonical route: /api/v1/internal/communication/send. The backend validates idempotency, applies the SMTP guardrail, and never sends real mail in development without configured SMTP.',
  })
  @ApiBody({ type: SendCommunicationDto })
  @ApiResponse({ status: 200, description: 'Communication sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized n8n callback.' })
  async send(@Body() dto: SendCommunicationDto) {
    return this.communicationService.send(dto);
  }
}
