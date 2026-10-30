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
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { RenewalService } from './renewal.service.js';
import type { RenewalDraft } from './entities/renewal-draft.entity.js';

@Controller('renewal')
@UseGuards(N8nAuthGuard)
export class RenewalController {
  constructor(private readonly renewalService: RenewalService) {}

  @Get('contracts')
  async getRenewalContracts(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.renewalService.findRenewalContracts(d);
  }

  @Get('contracts/:id')
  async getContract(@Param('id', ParseUUIDPipe) id: string) {
    return this.renewalService.getContract(id);
  }

  @Post('urgency')
  calculateUrgency(@Body() body: { renewalDate: string }) {
    return this.renewalService.calculateUrgency(
      body.renewalDate ? new Date(body.renewalDate) : null,
    );
  }

  @Post('drafts')
  async saveDraft(@Body() body: Partial<RenewalDraft>) {
    return this.renewalService.saveDraft(body);
  }
  @Post('validate-draft')
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
  checkEligibility(@Body() body: Record<string, unknown>) {
    const b2 = body as {
      hasConsent?: boolean;
      hasTemplate?: boolean;
      policyAllows?: boolean;
      needsApproval?: boolean;
    };
    const hasConsent = b2.hasConsent === true;
    const hasTemplate = b2.hasTemplate === true;
    const policyAllows = b2.policyAllows === true;
    const needsApproval = b2.needsApproval === true;
    const canAutoSend =
      hasConsent && hasTemplate && policyAllows && !needsApproval;
    let reason = 'OK';
    if (!hasConsent) reason = 'MISSING_CONSENT';
    else if (!hasTemplate) reason = 'INVALID_TEMPLATE';
    else if (!policyAllows) reason = 'POLICY_DENIED';
    else if (needsApproval) reason = 'APPROVAL_REQUIRED';
    return { canAutoSend, reason };
  }
}
