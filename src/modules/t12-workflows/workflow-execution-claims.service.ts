import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import type { ClaimWorkflowExecutionDto } from './dto/claim-workflow-execution.dto.js';

@Injectable()
export class WorkflowExecutionClaimsService {
  constructor(private readonly dataSource: DataSource) {}

  async claim(dto: ClaimWorkflowExecutionDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkflowRun);
      const run = await repository.findOne({
        where: {
          id: dto.workflowRunId,
          workflowName: dto.workflowName,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!run) {
        throw new NotFoundException('WorkflowRun not found for this workflow');
      }

      const isActive = [
        WorkflowStatus.PENDING,
        WorkflowStatus.RUNNING,
      ].includes(run.status);

      if (!isActive) {
        return {
          claimed: false,
          duplicate: false,
          reason: 'RUN_NOT_ACTIVE' as const,
          status: run.status,
        };
      }

      // A retry of the claim request from the same n8n execution is safe.
      // A different execution must stop before performing AI or side effects.
      if (run.n8nExecutionId === dto.n8nExecutionId) {
        return {
          claimed: true,
          duplicate: true,
          status: run.status,
        };
      }

      if (run.n8nExecutionId !== null) {
        return {
          claimed: false,
          duplicate: false,
          reason: 'ALREADY_CLAIMED' as const,
          status: run.status,
        };
      }

      run.n8nExecutionId = dto.n8nExecutionId;
      run.status = WorkflowStatus.RUNNING;
      await repository.save(run);

      return {
        claimed: true,
        duplicate: false,
        status: run.status,
      };
    });
  }
}
