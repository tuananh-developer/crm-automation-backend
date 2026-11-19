import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { AccountHealthService } from './account-health.service.js';
import { CustomersService } from './customers.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccountHealthSnapshot } from './entities/account-health-snapshot.entity.js';
import { Customer } from './entities/customer.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { CustomerFeedback } from '../feedback/entities/customer-feedback.entity.js';
import { QueryCustomerDto } from './dto/index.js';
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
    @Optional()
    private readonly customersService?: CustomersService,
    @Optional()
    @InjectRepository(Lead)
    private readonly leadRepo?: Repository<Lead>,
    @Optional()
    @InjectRepository(Interaction)
    private readonly interactionRepo?: Repository<Interaction>,
    @Optional()
    @InjectRepository(LeadFollowUpEnrollment)
    private readonly enrollmentRepo?: Repository<LeadFollowUpEnrollment>,
    @Optional()
    @InjectRepository(CustomerFeedback)
    private readonly feedbackRepo?: Repository<CustomerFeedback>,
    @Optional()
    @InjectRepository(CustomerTask)
    private readonly customerTaskRepo?: Repository<CustomerTask>,
  ) {}

  @Get('customers')
  async listCustomers(@Query() query: QueryCustomerDto) {
    if (this.customersService) {
      return this.customersService.findAllInternal(query);
    }
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.isStrategic !== undefined) where.isStrategic = query.isStrategic;
    const data = await this.customerRepo.find({ where });
    return {
      data,
      meta: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        total: data.length,
        totalPages: 1,
      },
    };
  }

  @Get('customers/:customerId/context')
  async getCustomerAccountHealthContext(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    const leads = this.leadRepo
      ? await this.leadRepo.find({
          where: { convertedCustomerId: customerId },
        })
      : [];
    const leadIds = leads.map((l) => l.id);

    const interactions =
      this.interactionRepo && leadIds.length > 0
        ? await this.interactionRepo.find({
            where: { leadId: In(leadIds) },
            order: { occurredAt: 'DESC' },
          })
        : [];

    const followUps =
      this.enrollmentRepo && leadIds.length > 0
        ? await this.enrollmentRepo.find({
            where: { leadId: In(leadIds) },
            relations: { executions: true },
            order: { createdAt: 'DESC' },
          })
        : [];

    const feedback = this.feedbackRepo
      ? await this.feedbackRepo.find({
          where: { customerId },
          order: { createdAt: 'DESC' },
        })
      : [];

    const issues = this.customerTaskRepo
      ? await this.customerTaskRepo.find({
          where: { customerId },
          order: { createdAt: 'DESC' },
        })
      : [];

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        companyName: customer.companyName,
        status: customer.status,
        isStrategic: customer.isStrategic,
        createdBy: customer.createdBy,
        ownerId: customer.createdBy,
      },
      interactions,
      followUps,
      feedback,
      issues,
    };
  }

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
      // Use SHA256 hash of all normalized input fields (or explicit idempotencyKey) to detect actual changes
      const inputHash = createHash('sha256')
        .update(
          JSON.stringify({
            idempotencyKey: body.idempotencyKey ?? null,
            engagement: body.engagement ?? null,
            feedback: body.feedback ?? null,
            openIssues: body.openIssues ?? null,
            followUpCompletion: body.followUpCompletion ?? null,
            evidence: body.evidence ?? [],
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
