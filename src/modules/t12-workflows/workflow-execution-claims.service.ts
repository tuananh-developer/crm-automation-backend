import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { SalesMeeting } from './entities/sales-meeting.entity.js';
import type {
  ClaimWorkflowExecutionDto,
  FailWorkflowExecutionDto,
} from './dto/claim-workflow-execution.dto.js';

const DEFAULT_LEASE_SECONDS = 20 * 60;
const MAX_LEASE_SECONDS = 60 * 60;

@Injectable()
export class WorkflowExecutionClaimsService {
  constructor(private readonly dataSource: DataSource) {}

  private leaseDurationMs(): number {
    const raw = Number(process.env.N8N_WORKFLOW_CLAIM_LEASE_SECONDS);
    const seconds =
      Number.isInteger(raw) && raw >= 60 && raw <= MAX_LEASE_SECONDS
        ? raw
        : DEFAULT_LEASE_SECONDS;
    return seconds * 1000;
  }

  private nextExpiry(now = new Date()): Date {
    return new Date(now.getTime() + this.leaseDurationMs());
  }

  private normalizeExecutionId(value: unknown): string {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || id.length > 255) {
      throw new BadRequestException(
        'n8nExecutionId must contain 1..255 non-whitespace characters',
      );
    }
    return id;
  }

  async claim(dto: ClaimWorkflowExecutionDto) {
    const n8nExecutionId = this.normalizeExecutionId(dto.n8nExecutionId);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkflowRun);
      const run = await repository.findOne({
        where: { id: dto.workflowRunId, workflowName: dto.workflowName },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) throw new NotFoundException('WorkflowRun not found for this workflow');

      if (![WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(run.status)) {
        return {
          claimed: false,
          duplicate: false,
          reason: 'RUN_NOT_ACTIVE' as const,
          status: run.status,
        };
      }

      const now = new Date();
      const leaseActive =
        Boolean(run.claimExpiresAt) &&
        run.claimExpiresAt!.getTime() > now.getTime();

      if (run.n8nExecutionId === n8nExecutionId) {
        run.status = WorkflowStatus.RUNNING;
        run.claimExpiresAt = this.nextExpiry(now);
        await repository.save(run);
        return {
          claimed: true,
          duplicate: true,
          status: run.status,
          leaseExpiresAt: run.claimExpiresAt.toISOString(),
        };
      }

      if (run.n8nExecutionId !== null && leaseActive) {
        return {
          claimed: false,
          duplicate: false,
          reason: 'ALREADY_CLAIMED' as const,
          status: run.status,
          leaseExpiresAt: run.claimExpiresAt?.toISOString() ?? null,
        };
      }

      const recovered = Boolean(run.n8nExecutionId);
      run.n8nExecutionId = n8nExecutionId;
      run.claimExpiresAt = this.nextExpiry(now);
      run.status = WorkflowStatus.RUNNING;
      await repository.save(run);
      return {
        claimed: true,
        duplicate: false,
        recovered,
        status: run.status,
        leaseExpiresAt: run.claimExpiresAt.toISOString(),
      };
    });
  }

  async heartbeat(dto: ClaimWorkflowExecutionDto) {
    const n8nExecutionId = this.normalizeExecutionId(dto.n8nExecutionId);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkflowRun);
      const run = await repository.findOne({
        where: { id: dto.workflowRunId, workflowName: dto.workflowName },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) throw new NotFoundException('WorkflowRun not found for this workflow');

      if (
        ![WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(run.status) ||
        run.n8nExecutionId !== n8nExecutionId
      ) {
        throw new ConflictException('Workflow execution no longer owns this claim');
      }
      const now = new Date();
      if (run.claimExpiresAt && run.claimExpiresAt.getTime() <= now.getTime()) {
        throw new ConflictException('Workflow execution claim lease has expired');
      }
      run.status = WorkflowStatus.RUNNING;
      run.claimExpiresAt = this.nextExpiry(now);
      await repository.save(run);
      return {
        renewed: true,
        workflowRunId: run.id,
        leaseExpiresAt: run.claimExpiresAt.toISOString(),
      };
    });
  }

  async fail(dto: FailWorkflowExecutionDto) {
    const n8nExecutionId = this.normalizeExecutionId(dto.n8nExecutionId);
    const errorCategory = dto.errorCategory.trim();
    const failedNodeName = dto.failedNodeName?.trim() || 'unknown';
    if (!/^[A-Z0-9_]{2,80}$/.test(errorCategory)) {
      throw new BadRequestException('errorCategory must be a stable uppercase code');
    }
    if (failedNodeName.length > 120 || /[\r\n]/.test(failedNodeName)) {
      throw new BadRequestException('failedNodeName must be a single line of at most 120 characters');
    }

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkflowRun);
      const run = await repository.findOne({
        where: dto.workflowRunId
          ? { id: dto.workflowRunId, workflowName: dto.workflowName }
          : { workflowName: dto.workflowName, n8nExecutionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) throw new NotFoundException('WorkflowRun not found for this workflow execution');
      if (run.status === WorkflowStatus.FAILED && run.n8nExecutionId === n8nExecutionId) {
        return { failed: true, duplicate: true, status: run.status };
      }
      // An Error Trigger can fire after the backend committed the final
      // approval/notification callback but n8n lost the HTTP response. Do not
      // overwrite an already-finalized business outcome in that case.
      if (
        [WorkflowStatus.SUCCESS, WorkflowStatus.PARTIAL].includes(run.status) &&
        run.n8nExecutionId === n8nExecutionId
      ) {
        return {
          failed: false,
          alreadyFinalized: true,
          status: run.status,
        };
      }
      const activeRun = [WorkflowStatus.PENDING, WorkflowStatus.RUNNING].includes(run.status);
      const claimedByAnotherExecution =
        run.n8nExecutionId !== null && run.n8nExecutionId !== n8nExecutionId;
      if (!activeRun || claimedByAnotherExecution) {
        throw new ConflictException('Workflow execution no longer owns this claim');
      }
      // A workflow can fail before its first claim (for example, input validation
      // or transcript minimization). The authenticated Error Handler may terminally
      // close that still-unclaimed run. Once another execution has claimed it, the
      // owner check above rejects this stale failure callback.
      if (run.n8nExecutionId === null) {
        if (!dto.workflowRunId) {
          throw new ConflictException(
            'workflowRunId is required to report a failure before execution claim',
          );
        }
        run.n8nExecutionId = n8nExecutionId;
      }
      run.status = WorkflowStatus.FAILED;
      run.finishedAt = new Date();
      run.claimExpiresAt = null;
      // Never persist provider messages, stack traces, headers or raw inputs.
      run.errorMessage = `N8N_EXECUTION_FAILED:${errorCategory}: ${failedNodeName}`.slice(0, 500);
      await repository.save(run);
      if (dto.workflowName === 'T12-WF11_SALES_MEETING') {
        await manager.getRepository(SalesMeeting).update(
          { workflowRunId: run.id, status: 'PROCESSING' },
          { status: 'FAILED', updatedAt: new Date() },
        );
      }
      return { failed: true, duplicate: false, status: run.status };
    });
  }
}
