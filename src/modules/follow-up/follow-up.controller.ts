import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { FollowUpService } from './follow-up.service.js';
import { ExecuteFollowUpDto, QueryFollowUpExecutionDto } from './dto/index.js';

@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Post('executions')
  @HttpCode(HttpStatus.OK)
  execute(@Body() dto: ExecuteFollowUpDto) {
    return this.followUpService.execute(dto);
  }

  @Get('executions')
  findExecutions(@Query() query: QueryFollowUpExecutionDto) {
    return this.followUpService.findExecutions(query);
  }
}
