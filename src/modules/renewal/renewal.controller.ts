import {
  Body,
  Controller,
  Get,
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
import type { RenewalDraft } from './entities/renewal-draft.entity.js';

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
  @ApiOperation({ summary: 'Compute renewal urgency from a date' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { renewalDate: { type: 'string', format: 'date-time' } },
    },
  })
  calculateUrgency(@Body() body: { renewalDate?: string }) {
    return this.renewalService.calculateUrgency(
      body.renewalDate ? new Date(body.renewalDate) : null,
    );
  }

  @Post('drafts')
  @ApiOperation({ summary: 'Create or update a renewal draft' })
  @ApiBody({ type: Object, description: 'Partial renewal draft fields' })
  async saveDraft(@Body() body: Partial<RenewalDraft>) {
    return this.renewalService.saveDraft(body);
  }

  @Post('validate-draft')
  @ApiOperation({ summary: 'Validate a renewal draft payload' })
  @ApiBody({ schema: { type: 'object' } })
  validateDraft(@Body() body: Record<string, unknown>) {
    const required = ['contractId', 'customerId', 'renewalDate'];
    const missing = required.filter((k) => !(k in body));
    const contractMatch =
      body.contractId && body.sourceContractId === body.contractId;
    const customerMatch =
      body.customerId && body.sourceCustomerId === body.customerId;
    return {
      valid: missing.length === 0 && contractMatch && customerMatch,
      missing,
      contractMatch,
      customerMatch,
    };
  }

  @Post('check-eligibility')
  @ApiOperation({ summary: 'Check whether a renewal can be auto-sent' })
  @ApiBody({ schema: { type: 'object' } })
  async checkEligibility(@Body() body: Record<string, unknown>) {
    const b2 = body as {
      contractId?: string;
      customerId?: string;
      draftId?: string;
      hasConsent?: boolean;
      hasTemplate?: boolean;
      policyAllows?: boolean;
      needsApproval?: boolean;
    };

    return this.renewalService.checkEligibility({
      contractId: String(b2.contractId ?? ''),
      customerId: String(b2.customerId ?? ''),
      draftId: b2.draftId,
      hasConsent: b2.hasConsent,
      hasTemplate: b2.hasTemplate,
      policyAllows: b2.policyAllows,
      needsApproval: b2.needsApproval,
    });
  }
}
