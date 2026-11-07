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
import {
  ClaimWorkflowExecutionDto,
  FailWorkflowExecutionDto,
} from './dto/claim-workflow-execution.dto.js';
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
      'Claims expire after the configured lease duration. A competing execution is rejected until expiry; the same execution can renew its claim.',
  })
  @ApiHeader({ name: 'X-N8N-API-KEY', required: true })
  @ApiResponse({ status: 200, description: 'Claim result.' })
  @ApiResponse({ status: 401, description: 'Invalid n8n service credential.' })
  @ApiResponse({ status: 404, description: 'WorkflowRun not found.' })
  claim(@Body() dto: ClaimWorkflowExecutionDto) {
    return this.claims.claim(dto);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew the active lease for the owning n8n execution' })
  heartbeat(@Body() dto: ClaimWorkflowExecutionDto) {
    return this.claims.heartbeat(dto);
  }

  @Post('failure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Persist a sanitized terminal failure from the shared n8n Error Handler',
    description:
      'Only the execution that currently owns the active WorkflowRun claim can fail it. Raw error text, stack traces and request data are not accepted.',
  })
  fail(@Body() dto: FailWorkflowExecutionDto) {
    return this.claims.fail(dto);
  }
}
