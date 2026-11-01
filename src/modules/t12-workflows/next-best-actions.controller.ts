import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { StartNextBestActionDto } from './dto/index.js';
import { NextBestActionsService } from './next-best-actions.service.js';

@ApiTags('Next Best Actions')
@Controller('next-best-actions')
@UseGuards(JwtAuthGuard)
export class NextBestActionsController {
  constructor(private readonly service: NextBestActionsService) {}

  @Get(':recommendationId')
  @ApiOperation({
    summary:
      'Read a recommendation visible to its Lead/Customer owner or Admin',
  })
  getRecommendation(
    @Param('recommendationId', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getRecommendation(id, actor);
  }

  @Post('requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Request an AI Next Best Action analysis for an authorized Lead or Customer',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: StartNextBestActionDto })
  @ApiResponse({
    status: 202,
    description: 'WorkflowRun created or reused and dispatched to n8n.',
  })
  request(
    @Body() dto: StartNextBestActionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.request(dto, actor, idempotencyKey);
  }
}
