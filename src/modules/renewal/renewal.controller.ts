import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { RenewalService } from './renewal.service.js';
import {
  CalculateUrgencyDto,
  CheckEligibilityDto,
  RecordRenewalAttemptDto,
  SaveRenewalDraftDto,
} from './dto/renewal.dto.js';

/**
 * Canonical internal routes: /api/v1/internal/n8n/renewal/...
 * Protected by N8nAuthGuard; browsers never call this directly.
 */
@ApiTags('Internal n8n - WF13 Renewal Management')
@Controller('internal/n8n/renewal')
@UseGuards(N8nAuthGuard)
export class RenewalController {
  constructor(private readonly renewalService: RenewalService) {}

  @Get('contracts')
  @ApiOperation({ summary: 'List contracts due for renewal within a window' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Contracts found.' })
  async getRenewalContracts(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.renewalService.findRenewalContracts(d);
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: 'Get a contract by ID' })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({ status: 200, description: 'Contract found.' })
  @ApiResponse({ status: 404, description: 'Contract not found.' })
  async getContract(@Param('id', ParseUUIDPipe) id: string) {
    return this.renewalService.getContract(id);
  }

  @Post('urgency')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compute renewal urgency from a date' })
  @ApiBody({ type: CalculateUrgencyDto })
  @ApiResponse({ status: 200, description: 'Urgency calculated.' })
  calculateUrgency(@Body() body: CalculateUrgencyDto) {
    return this.renewalService.calculateUrgency(
      body.renewalDate ? new Date(body.renewalDate) : null,
    );
  }

  @Post('drafts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update a renewal draft idempotently' })
  @ApiBody({ type: SaveRenewalDraftDto })
  @ApiResponse({ status: 201, description: 'Renewal draft persisted.' })
  async saveDraft(@Body() body: SaveRenewalDraftDto) {
    return this.renewalService.saveDraft(body);
  }

  @Post('validate-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Validate a renewal draft payload against contract and customer context',
  })
  @ApiBody({ schema: { type: 'object' } })
  @ApiResponse({ status: 200, description: 'Validation result.' })
  validateDraft(@Body() body: Record<string, unknown>) {
    const required = ['contractId', 'customerId', 'renewalDate'];
    const missing = required.filter((k) => !(k in body));
    const contractMatch =
      body.contractId &&
      (!('sourceContractId' in body) ||
        body.sourceContractId === body.contractId);
    const customerMatch =
      body.customerId &&
      (!('sourceCustomerId' in body) ||
        body.sourceCustomerId === body.customerId);
    const valid =
      missing.length === 0 && Boolean(contractMatch) && Boolean(customerMatch);
    return {
      valid,
      missing,
      contractMatch: Boolean(contractMatch),
      customerMatch: Boolean(customerMatch),
    };
  }

  @Post('check-eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check whether a renewal can be auto-sent',
    description:
      'Backend-authoritative only. Caller booleans are advisory and never trusted. Without persisted consent/template/policy/approval records the result is FAIL_CLOSED.',
  })
  @ApiBody({ type: CheckEligibilityDto })
  @ApiResponse({ status: 200, description: 'Eligibility decision.' })
  checkEligibility(@Body() body: CheckEligibilityDto) {
    return this.renewalService.checkEligibility(body);
  }

  @Post('record-attempt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record renewal attempt outcome idempotently' })
  @ApiBody({ type: RecordRenewalAttemptDto })
  @ApiResponse({ status: 200, description: 'Attempt recorded.' })
  recordAttempt(@Body() body: RecordRenewalAttemptDto) {
    return this.renewalService.recordRenewalAttempt(body);
  }
}
