import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { CommunicationService } from './communication.service.js';

@ApiTags('Communication')
@Controller('communication/deliveries')
@UseGuards(JwtAuthGuard)
export class CommunicationController {
  constructor(private readonly communication: CommunicationService) {}

  @Get(':executionId')
  @ApiOperation({
    summary: 'Read the delivery status for an owned follow-up execution',
  })
  getDeliveryStatus(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.communication.getDeliveryStatus(executionId, actor);
  }
}
