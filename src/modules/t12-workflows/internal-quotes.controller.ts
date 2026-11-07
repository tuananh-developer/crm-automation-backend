import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { QuotesService, WF12_NAME } from './quotes.service.js';
import { WorkflowExecutionClaimsService } from './workflow-execution-claims.service.js';
import {
  CreateQuoteInternalDto,
  QuotePricePreviewDto,
  SubmitQuoteApprovalDto,
  ClaimQuoteEntityContextDto,
} from './dto/index.js';

@ApiTags('Internal n8n — WF12 Quote & Proposal')
@Controller('internal/n8n/quotes')
@UseGuards(N8nAuthGuard)
export class InternalQuotesController {
  constructor(
    private readonly service: QuotesService,
    private readonly claims: WorkflowExecutionClaimsService,
  ) {}

  @Get('entity-context')
  @ApiOperation({
    summary: 'Read scoped Lead or Customer context for quote generation',
  })
  getEntityContext(
    @Query('customerId') customerId?: string,
    @Query('leadId') leadId?: string,
    @Query('workflowRunId') workflowRunId?: string,
  ) {
    return this.service.getEntityContext(customerId, leadId, workflowRunId);
  }

  @Post('claim-and-entity-context')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate quote context and atomically claim the WF12 execution',
    description:
      'A competing execution receives HTTP 409 before AI proposal generation. A retry from the winning execution is idempotent.',
  })
  async claimAndGetEntityContext(@Body() dto: ClaimQuoteEntityContextDto) {
    const context = await this.service.getEntityContext(
      dto.customerId,
      dto.leadId,
      dto.workflowRunId,
    );
    const claim = await this.claims.claim({
      workflowRunId: dto.workflowRunId,
      workflowName: WF12_NAME,
      n8nExecutionId: dto.n8nExecutionId,
    });
    if (!claim.claimed) {
      throw new ConflictException(
        'WorkflowRun is already claimed by another n8n execution or is no longer active',
      );
    }
    return context;
  }

  @Post('price-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Calculate canonical price from active backend catalog, ignoring AI prices',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  pricePreview(
    @Body() dto: QuotePricePreviewDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.pricePreview(dto, key);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Persist quote draft using backend-calculated prices',
  })
  saveDraft(@Body() dto: CreateQuoteInternalDto) {
    return this.service.saveDraft(dto);
  }

  @Post(':quoteId/submit-for-approval')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a quote for explicit Admin approval' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  submit(
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: SubmitQuoteApprovalDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.submitForApproval(quoteId, dto, key);
  }
}
