import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { FollowUpService } from './follow-up.service.js';
import {
  EnrollLeadDto,
  ExecuteFollowUpDto,
  QueryFollowUpExecutionDto,
  UpdateEnrollmentDto,
} from './dto/index.js';

@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Post('enrollments')
  @HttpCode(HttpStatus.CREATED)
  enrollLead(@Body() dto: EnrollLeadDto) {
    return this.followUpService.enrollLead(dto);
  }

  @Post('enrollments/:id/pause')
  pauseEnrollment(@Param('id') id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.followUpService.pauseEnrollment(id, dto);
  }

  @Post('enrollments/:id/resume')
  resumeEnrollment(@Param('id') id: string) {
    return this.followUpService.resumeEnrollment(id);
  }

  @Post('enrollments/:id/cancel')
  cancelEnrollment(@Param('id') id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.followUpService.cancelEnrollment(id, dto);
  }

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
