import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { CommunicationService } from './communication.service.js';

@ApiTags('Internal Communication')
@Controller('internal/communication/follow-ups')
@UseGuards(N8nAuthGuard)
export class InternalCommunicationController {
  constructor(private readonly communication: CommunicationService) {}

  @Post(':executionId/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a persisted follow-up execution through the backend SMTP adapter',
    description:
      'The caller supplies only the execution ID. Recipient, subject and message are read from the persisted FollowUpExecution; the backend enforces delivery idempotency.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  sendFollowUp(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.communication.sendFollowUpExecution(
      executionId,
      idempotencyKey,
    );
  }
}
