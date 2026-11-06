import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { ClaimWorkflowExecutionDto } from './dto/claim-workflow-execution.dto.js';
import { WorkflowExecutionClaimsService } from './workflow-execution-claims.service.js';

@ApiTags('Internal n8n execution claims')
@Controller('internal/n8n/workflow-executions')
@UseGuards(N8nAuthGuard)
export class InternalWorkflowExecutionClaimsController {
  constructor(private readonly claims: WorkflowExecutionClaimsService) {}

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically claim a WorkflowRun for one n8n execution',
    description:
      'A second n8n execution for the same active WorkflowRun receives claimed=false and must stop before AI processing or side effects. Retrying the claim from the same execution is idempotent.',
  })
  @ApiHeader({ name: 'X-N8N-API-KEY', required: true })
  @ApiResponse({ status: 200, description: 'Claim result.' })
  @ApiResponse({ status: 401, description: 'Invalid n8n service credential.' })
  @ApiResponse({ status: 404, description: 'WorkflowRun not found.' })
  claim(@Body() dto: ClaimWorkflowExecutionDto) {
    return this.claims.claim(dto);
  }
}
