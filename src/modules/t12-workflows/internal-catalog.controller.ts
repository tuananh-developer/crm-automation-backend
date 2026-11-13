import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { QuotesService } from './quotes.service.js';

@ApiTags('Internal n8n — Catalog')
@Controller('internal/n8n/catalog')
@UseGuards(N8nAuthGuard)
export class InternalCatalogController {
  constructor(private readonly service: QuotesService) {}
  @Get('items')
  @ApiOperation({
    summary: 'List active catalog items for an existing quote WorkflowRun',
  })
  list(
    @Query('workflowRunId') workflowRunId: string,
    @Query('n8nExecutionId') n8nExecutionId: string,
  ) {
    return this.service.listCatalogForRun(workflowRunId, n8nExecutionId);
  }
}
