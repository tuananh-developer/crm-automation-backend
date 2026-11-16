import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { AccountHealthService } from './account-health.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountHealthSnapshot } from './entities/account-health-snapshot.entity.js';
import { Customer } from './entities/customer.entity.js';
import {
  CalculateAccountHealthDto,
  ValidateActionsDto,
  ValidateAiOutputDto,
} from './dto/account-health.dto.js';

/**
 * Canonical internal routes: /api/v1/internal/n8n/account-health/...
 * Protected by N8nAuthGuard; browsers never call this directly.
 */
@Controller('internal/n8n/account-health')
@UseGuards(N8nAuthGuard)
export class AccountHealthController {
  constructor(
    private readonly accountHealthService: AccountHealthService,
    @InjectRepository(AccountHealthSnapshot)
    private readonly snapshotRepo: Repository<AccountHealthSnapshot>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  @Post('calculate')
  async calculate(@Body() body: CalculateAccountHealthDto) {
    const result = this.accountHealthService.calculate(
      {
        engagement: body.engagement ?? null,
        feedback: body.feedback ?? null,
        openIssues: body.openIssues ?? null,
        followUpCompletion: body.followUpCompletion ?? null,
      },
      body.evidence,
    );

    let savedSnapshot: AccountHealthSnapshot | undefined;

    if (body.customerId && result.status !== 'INSUFFICIENT_DATA') {
      const customer = await this.customerRepo.findOne({
        where: { id: body.customerId },
      });
      if (!customer) {
        throw new NotFoundException(
          `Customer with ID '${body.customerId}' not found`,
        );
      }

      // Idempotency: avoid duplicate snapshot on workflow retries within 5 minutes
      // Use SHA256 hash of all input fields to detect actual changes
      const crypto = await import('crypto');
      const inputHash = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            engagement: body.engagement,
            feedback: body.feedback,
            openIssues: body.openIssues,
            followUpCompletion: body.followUpCompletion,
            evidence: body.evidence,
          }),
        )
        .digest('hex');

      const recentThreshold = new Date(Date.now() - 5 * 60 * 1000);
      const existing = await this.snapshotRepo.findOne({
        where: { customerId: body.customerId },
        order: { assessedAt: 'DESC' },
      });

      if (
        existing &&
        existing.dataCoverage?.inputHash === inputHash &&
        existing.assessedAt >= recentThreshold
      ) {
        savedSnapshot = existing;
      } else {
        const snapshot = this.snapshotRepo.create({
          customerId: body.customerId,
          score: result.score,
          status: result.status,
          breakdown: {
            ...result.breakdown,
            policyVersion: result.policyVersion,
          },
          evidence: result.evidence,
          missingData: result.missingData,
          dataCoverage: {
            policyVersion: result.policyVersion,
            evaluatedAt: new Date().toISOString(),
            inputHash,
          },
          assessedAt: new Date(),
        });
        savedSnapshot = await this.snapshotRepo.save(snapshot);
      }
    }

    return {
      ...result,
      id: savedSnapshot?.id,
      snapshotId: savedSnapshot?.id,
    };
  }

  @Get('snapshots/:customerId')
  async getHistory(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.snapshotRepo.find({
      where: { customerId },
      order: { assessedAt: 'DESC' },
    });
  }

  @Post('validate-actions')
  validateActions(@Body() body: ValidateActionsDto) {
    const allowedActions = [
      'CREATE_RETENTION_TASK',
      'ESCALATE_RISK',
      'SCHEDULE_REVIEW',
    ];
    const actions = Array.isArray(body.actions) ? body.actions : [];
    const validated = actions.filter((a) => {
      if (!allowedActions.includes(a.type)) return false;
      if (!a.evidence || !Array.isArray(a.evidence) || a.evidence.length === 0)
        return false;
      return a.evidence.every(
        (e) =>
          e.customerId === body.customerId && e.snapshotId === body.snapshotId,
      );
    });
    return {
      valid: validated,
      rejected: actions.length - validated.length,
      success: validated.length > 0 && actions.length === validated.length,
    };
  }

  @Post('validate-ai-output')
  validateAiOutput(@Body() body: ValidateAiOutputDto) {
    const required = [
      'summary',
      'keyEvidence',
      'risks',
      'opportunities',
      'recommendedActions',
      'actionPriority',
      'evidenceReferences',
    ];

    let ai: Record<string, unknown> = {};
    if (typeof body.aiOutput === 'string') {
      try {
        ai = JSON.parse(body.aiOutput) as Record<string, unknown>;
      } catch {
        return {
          valid: false,
          missing: required,
          scoreMismatch: false,
          error: 'aiOutput is not valid JSON',
        };
      }
    } else if (body.aiOutput && typeof body.aiOutput === 'object') {
      ai = body.aiOutput;
    }

    const missing = required.filter((k) => !(k in ai));
    const aiScore = typeof ai.score === 'number' ? ai.score : undefined;
    const scoreMismatch = aiScore !== undefined && aiScore !== body.score;

    return {
      valid: missing.length === 0 && !scoreMismatch,
      missing,
      scoreMismatch,
    };
  }
}
