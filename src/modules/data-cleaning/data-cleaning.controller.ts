import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DataCleaningService } from './data-cleaning.service.js';
import {
  CreateScanDto,
  DataCleaningCallbackDto,
  ApplyCleaningDto,
} from './dto/index.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

@ApiTags('Data Cleaning')
@Controller('data-cleaning')
export class DataCleaningController {
  constructor(private readonly dataCleaningService: DataCleaningService) {}

  @Post('scans')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Initiate a new Data Cleaning Scan (UC10 - Steps 1-5)',
    description:
      'Creates a WorkflowRun in PENDING status and dispatches a data.cleaning.requested event to RabbitMQ for n8n to ingest.',
  })
  @ApiBody({ type: CreateScanDto })
  @ApiResponse({
    status: 202,
    description: 'Data cleaning scan has been initiated successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or validation error.',
  })
  createScan(@Body() dto: CreateScanDto) {
    return this.dataCleaningService.createScan(dto);
  }

  @Get('scans/:workflowRunId')
  @ApiOperation({
    summary: 'Get Data Cleaning Scan Status & Findings (UC10 - Step 11)',
    description:
      'Returns current workflow status, summary metrics, and the full list of detected findings and proposals.',
  })
  @ApiParam({
    name: 'workflowRunId',
    description: 'UUID of the WorkflowRun',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Scan report details.',
  })
  @ApiResponse({
    status: 404,
    description: 'WorkflowRun not found.',
  })
  getScan(@Param('workflowRunId', ParseUUIDPipe) workflowRunId: string) {
    return this.dataCleaningService.getScan(workflowRunId);
  }

  @Get('scans/:workflowRunId/leads')
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Fetch Target Leads for n8n Agent Batch Scan (UC10 - Step 6)',
    description:
      'Internal API secured by N8N_API_KEY allowing n8n to fetch the lead batch defined by the scan scope.',
  })
  @ApiParam({
    name: 'workflowRunId',
    description: 'UUID of the WorkflowRun',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch of leads targeted for scanning.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({
    status: 404,
    description: 'WorkflowRun not found.',
  })
  getLeadsForScan(
    @Param('workflowRunId', ParseUUIDPipe) workflowRunId: string,
  ) {
    return this.dataCleaningService.getLeadsForScan(workflowRunId);
  }

  @Post('callback')
  @UseGuards(N8nAuthGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive n8n Data Cleaning Callback (UC10 - Step 10)',
    description:
      'Receives finding report from n8n Data Cleaning Agent, stores results in WorkflowRun output, and updates status to SUCCESS.',
  })
  @ApiBody({ type: DataCleaningCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Callback processed successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({
    status: 404,
    description: 'WorkflowRun not found.',
  })
  handleCallback(@Body() dto: DataCleaningCallbackDto) {
    return this.dataCleaningService.handleCallback(dto);
  }

  @Post('scans/:workflowRunId/apply')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply Approved Remediation Proposals (UC10 - Step 12)',
    description:
      'Applies user-selected findings within an ACID transaction, re-validates freshness, updates Lead records, and creates AuditLog entries.',
  })
  @ApiParam({
    name: 'workflowRunId',
    description: 'UUID of the WorkflowRun',
    format: 'uuid',
  })
  @ApiBody({ type: ApplyCleaningDto })
  @ApiResponse({
    status: 200,
    description: 'Cleaning proposals applied successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Scan not ready or no valid findings to apply.',
  })
  @ApiResponse({
    status: 404,
    description: 'WorkflowRun not found.',
  })
  applyCleaning(
    @Param('workflowRunId', ParseUUIDPipe) workflowRunId: string,
    @Body() dto: ApplyCleaningDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id;
    return this.dataCleaningService.applyCleaning(workflowRunId, dto, userId);
  }
}
