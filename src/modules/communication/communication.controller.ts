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

@ApiTags('Communication')
@Controller('communication')
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Post('send')
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a communication message' })
  @ApiBody({ type: SendCommunicationDto })
  @ApiResponse({ status: 200, description: 'Communication sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async send(@Body() dto: SendCommunicationDto) {
    return this.communicationService.send(dto);
  }
}
