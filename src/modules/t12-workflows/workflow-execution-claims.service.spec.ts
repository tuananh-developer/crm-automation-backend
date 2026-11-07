import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ClaimWorkflowExecutionDto } from './dto/claim-workflow-execution.dto.js';
import { WorkflowExecutionClaimsService } from './workflow-execution-claims.service.js';

describe('WorkflowExecutionClaimsService', () => {
  const request: ClaimWorkflowExecutionDto = {
    workflowRunId: '11111111-1111-4111-8111-111111111111',
    workflowName: 'T12-WF10_NEXT_BEST_ACTION',
    n8nExecutionId: 'execution-1',
  };

  let service: WorkflowExecutionClaimsService;
  let run: WorkflowRun;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let manager: { getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    run = {
      id: request.workflowRunId,
      workflowName: request.workflowName,
      n8nExecutionId: null,
      leadId: null,
      customerId: null,
      triggeredByUserId: 'user-1',
      status: WorkflowStatus.PENDING,
      inputPayload: {},
      outputPayload: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
      idempotencyKey: null,
      createdAt: new Date(),
    };

    repository = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(run)),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    manager = {
      getRepository: jest.fn().mockReturnValue(repository),
    };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    service = new WorkflowExecutionClaimsService(
      dataSource as unknown as DataSource,
    );
  });

  it('claims an active run under a row lock', async () => {
    const result = await service.claim(request);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: request.workflowRunId,
        workflowName: request.workflowName,
      },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        n8nExecutionId: request.n8nExecutionId,
        status: WorkflowStatus.RUNNING,
      }),
    );
    expect(result).toEqual({
      claimed: true,
      duplicate: false,
      status: WorkflowStatus.RUNNING,
    });
  });

  it('rejects a whitespace-only execution ID before opening a transaction', async () => {
    await expect(
      service.claim({ ...request, n8nExecutionId: '  \n\t ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('trims the execution ID before persisting the claim', async () => {
    const result = await service.claim({
      ...request,
      n8nExecutionId: '  execution-1  ',
    });

    expect(result).toEqual({
      claimed: true,
      duplicate: false,
      status: WorkflowStatus.RUNNING,
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        n8nExecutionId: 'execution-1',
        status: WorkflowStatus.RUNNING,
      }),
    );
  });

  it('allows an idempotent retry from the same n8n execution', async () => {
    run.n8nExecutionId = request.n8nExecutionId;
    run.status = WorkflowStatus.RUNNING;

    const result = await service.claim({ ...request, n8nExecutionId: '  execution-1  ' });

    expect(result).toEqual({
      claimed: true,
      duplicate: true,
      status: WorkflowStatus.RUNNING,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a second n8n execution for an already claimed run', async () => {
    run.n8nExecutionId = 'execution-original';
    run.status = WorkflowStatus.RUNNING;

    const result = await service.claim({
      ...request,
      n8nExecutionId: 'execution-retry',
    });

    expect(result).toEqual({
      claimed: false,
      duplicate: false,
      reason: 'ALREADY_CLAIMED',
      status: WorkflowStatus.RUNNING,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not claim a terminal WorkflowRun', async () => {
    run.status = WorkflowStatus.SUCCESS;

    const result = await service.claim(request);

    expect(result).toEqual({
      claimed: false,
      duplicate: false,
      reason: 'RUN_NOT_ACTIVE',
      status: WorkflowStatus.SUCCESS,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
