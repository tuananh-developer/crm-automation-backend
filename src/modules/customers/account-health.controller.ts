import {
  Body,
  Controller,
  Get,
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

interface CalculateBody {
  customerId?: string;
  engagement?: number | null;
  feedback?: number | null;
  openIssues?: number | null;
  followUpCompletion?: number | null;
}

interface ValidateActionsBody {
  customerId?: string;
  snapshotId?: string;
  actions?: Array<{
    type: string;
    evidence?: Array<{ customerId?: string; snapshotId?: string }>;
  }>;
}

interface ValidateAiBody {
  score: number;
  aiOutput: Record<string, unknown>;
}

@Controller('account-health')
@UseGuards(N8nAuthGuard)
export class AccountHealthController {
  constructor(
    private readonly accountHealthService: AccountHealthService,
    @InjectRepository(AccountHealthSnapshot)
    private readonly snapshotRepo: Repository<AccountHealthSnapshot>,
  ) {}

  @Post('calculate')
  async calculate(@Body() body: CalculateBody) {
    const result = this.accountHealthService.calculate({
      engagement: body.engagement ?? null,
      feedback: body.feedback ?? null,
      openIssues: body.openIssues ?? null,
      followUpCompletion: body.followUpCompletion ?? null,
    });

    if (body.customerId && result.status !== 'INSUFFICIENT_DATA') {
      const snapshot = this.snapshotRepo.create({
        customerId: body.customerId,
        score: result.score,
        status: result.status,
        breakdown: result.breakdown,
        evidence: result.evidence,
        missingData: result.missingData,
        dataCoverage: {},
        assessedAt: new Date(),
      });
      await this.snapshotRepo.save(snapshot);
    }

    return result;
  }

  @Get('snapshots/:customerId')
  async getHistory(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.snapshotRepo.find({
      where: { customerId },
      order: { assessedAt: 'DESC' },
    });
  }

  @Post('validate-actions')
  validateActions(@Body() body: ValidateActionsBody) {
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
    return { valid: validated, rejected: actions.length - validated.length };
  }

  @Post('validate-ai-output')
  validateAiOutput(@Body() body: ValidateAiBody) {
    const required = [
      'summary',
      'keyEvidence',
      'risks',
      'opportunities',
      'recommendedActions',
      'actionPriority',
      'evidenceReferences',
    ];
    const ai = body.aiOutput || {};
    const missing = required.filter((k) => !(k in ai));
    const scoreMismatch = ai.score !== undefined && ai.score !== body.score;
    return {
      valid: missing.length === 0 && !scoreMismatch,
      missing,
      scoreMismatch,
    };
  }
}
