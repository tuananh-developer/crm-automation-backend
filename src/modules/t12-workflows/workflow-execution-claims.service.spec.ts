import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import {
  ClaimWorkflowExecutionDto,
  FailWorkflowExecutionDto,
} from './dto/claim-workflow-execution.dto.js';
import { WorkflowExecutionClaimsService } from './workflow-execution-claims.service.js';

describe('WorkflowExecutionClaimsService', () => {
  const request: ClaimWorkflowExecutionDto = {
    workflowRunId: '11111111-1111-4111-8111-111111111111',
    workflowName: 'T12-WF10_NEXT_BEST_ACTION',
    n8nExecutionId: 'execution-1',
  };
  let service: WorkflowExecutionClaimsService;
  let run: WorkflowRun;
  let repository: { findOne: jest.Mock; save: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    run = {
      id: request.workflowRunId,
      workflowName: request.workflowName,
      n8nExecutionId: null,
      claimExpiresAt: null,
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
    manager = { getRepository: jest.fn().mockReturnValue(repository) };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) => callback(manager)),
    };
    service = new WorkflowExecutionClaimsService(dataSource as unknown as DataSource);
  });

  it('claims an active run under a row lock and sets a lease expiry', async () => {
    const result = await service.claim(request);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: request.workflowRunId, workflowName: request.workflowName },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      n8nExecutionId: request.n8nExecutionId,
      status: WorkflowStatus.RUNNING,
      claimExpiresAt: expect.any(Date),
    }));
    expect(result).toMatchObject({ claimed: true, duplicate: false, status: WorkflowStatus.RUNNING });
  });

  it('rejects whitespace-only execution IDs before opening a transaction', async () => {
    await expect(service.claim({ ...request, n8nExecutionId: '  \n\t ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('trims execution IDs before persisting a claim', async () => {
    await service.claim({ ...request, n8nExecutionId: '  execution-1  ' });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      n8nExecutionId: 'execution-1',
      status: WorkflowStatus.RUNNING,
    }));
  });

  it('renews a duplicate claim made by the same execution', async () => {
    run.n8nExecutionId = request.n8nExecutionId;
    run.status = WorkflowStatus.RUNNING;
    expect(await service.claim(request)).toMatchObject({ claimed: true, duplicate: true });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ claimExpiresAt: expect.any(Date) }));
  });

  it('rejects a competing execution while the current lease is active', async () => {
    run.n8nExecutionId = 'execution-original';
    run.claimExpiresAt = new Date(Date.now() + 60_000);
    run.status = WorkflowStatus.RUNNING;
    expect(await service.claim({ ...request, n8nExecutionId: 'execution-retry' }))
      .toMatchObject({ claimed: false, reason: 'ALREADY_CLAIMED' });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('recovers a stale execution after its lease expires', async () => {
    run.n8nExecutionId = 'execution-stale';
    run.claimExpiresAt = new Date(Date.now() - 1_000);
    run.status = WorkflowStatus.RUNNING;
    expect(await service.claim({ ...request, n8nExecutionId: 'execution-recovered' }))
      .toMatchObject({ claimed: true, duplicate: false, recovered: true });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      n8nExecutionId: 'execution-recovered',
      claimExpiresAt: expect.any(Date),
    }));
  });

  it('renews a lease only for its current owner', async () => {
    run.n8nExecutionId = request.n8nExecutionId;
    run.claimExpiresAt = new Date(Date.now() + 60_000);
    run.status = WorkflowStatus.RUNNING;
    expect(await service.heartbeat(request)).toMatchObject({ renewed: true });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ claimExpiresAt: expect.any(Date) }));
  });

  it('rejects a heartbeat after its lease expires', async () => {
    run.n8nExecutionId = request.n8nExecutionId;
    run.claimExpiresAt = new Date(Date.now() - 1_000);
    run.status = WorkflowStatus.RUNNING;
    await expect(service.heartbeat(request)).rejects.toBeInstanceOf(ConflictException);
  });

  it('records sanitized failure diagnostics for the owning execution', async () => {
    run.n8nExecutionId = request.n8nExecutionId;
    run.claimExpiresAt = new Date(Date.now() + 60_000);
    run.status = WorkflowStatus.RUNNING;
    const failure: FailWorkflowExecutionDto = {
      ...request,
      errorCategory: 'UPSTREAM_PROVIDER_FAILURE',
      failedNodeName: 'Gemini Proposal Draft',
    };
    expect(await service.fail(failure)).toEqual({
      failed: true, duplicate: false, status: WorkflowStatus.FAILED,
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowStatus.FAILED,
      finishedAt: expect.any(Date),
      claimExpiresAt: null,
      errorMessage: 'N8N_EXECUTION_FAILED:UPSTREAM_PROVIDER_FAILURE: Gemini Proposal Draft',
    }));
  });

  it('records a sanitized failure when validation fails before the first execution claim', async () => {
    run.n8nExecutionId = null;
    run.claimExpiresAt = null;
    run.status = WorkflowStatus.RUNNING;
    const failure: FailWorkflowExecutionDto = {
      ...request,
      errorCategory: 'INVALID_INPUT',
      failedNodeName: 'Code: Validate Entity Reference',
    };

    expect(await service.fail(failure)).toEqual({
      failed: true,
      duplicate: false,
      status: WorkflowStatus.FAILED,
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      n8nExecutionId: request.n8nExecutionId,
      status: WorkflowStatus.FAILED,
      claimExpiresAt: null,
      errorMessage: 'N8N_EXECUTION_FAILED:INVALID_INPUT: Code: Validate Entity Reference',
    }));
  });

  it.each([
    { label: 'WF01', workflowName: 'lead-qualification' },
    { label: 'WF08', workflowName: 'UC10_DATA_CLEANING' },
  ])('records a pre-claim failure from $label using the persisted workflow name', async ({ workflowName }) => {
    run.workflowName = workflowName;
    run.n8nExecutionId = null;
    run.claimExpiresAt = null;
    run.status = WorkflowStatus.PENDING;

    const result = await service.fail({
      workflowRunId: request.workflowRunId,
      workflowName,
      n8nExecutionId: 'rabbitmq-execution-1',
      errorCategory: 'UPSTREAM_PROVIDER_FAILURE',
      failedNodeName: 'Gemini Provider',
    });

    expect(result).toEqual({
      failed: true,
      duplicate: false,
      status: WorkflowStatus.FAILED,
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: request.workflowRunId,
        workflowName,
      },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      workflowName,
      n8nExecutionId: 'rabbitmq-execution-1',
      status: WorkflowStatus.FAILED,
      claimExpiresAt: null,
    }));
  });

  it('requires workflowRunId when reporting a failure before a run has been claimed', async () => {
    run.n8nExecutionId = null;
    run.status = WorkflowStatus.RUNNING;
    await expect(service.fail({
      workflowName: request.workflowName,
      n8nExecutionId: request.n8nExecutionId,
      errorCategory: 'INVALID_INPUT',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not overwrite a successful result when the final callback response was lost', async () => {
    run.n8nExecutionId = request.n8nExecutionId;
    run.claimExpiresAt = null;
    run.status = WorkflowStatus.SUCCESS;
    const result = await service.fail({
      ...request,
      errorCategory: 'UPSTREAM_TIMEOUT',
      failedNodeName: 'Create Review and Notification',
    });
    expect(result).toEqual({
      failed: false,
      alreadyFinalized: true,
      status: WorkflowStatus.SUCCESS,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects failure callbacks from stale execution owners', async () => {
    run.n8nExecutionId = 'execution-current';
    run.claimExpiresAt = new Date(Date.now() + 60_000);
    run.status = WorkflowStatus.RUNNING;
    await expect(service.fail({ ...request, errorCategory: 'UPSTREAM_PROVIDER_FAILURE' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('locates a failed run by execution ID when the Error Trigger has no run ID', async () => {
    run.n8nExecutionId = request.n8nExecutionId;
    run.claimExpiresAt = new Date(Date.now() + 60_000);
    run.status = WorkflowStatus.RUNNING;
    await service.fail({ workflowName: request.workflowName, n8nExecutionId: request.n8nExecutionId, errorCategory: 'UPSTREAM_PROVIDER_FAILURE' });
    expect(repository.findOne).toHaveBeenCalledWith({ where: { workflowName: request.workflowName, n8nExecutionId: request.n8nExecutionId }, lock: { mode: 'pessimistic_write' } });
  });

  it('rejects free-form error text instead of a stable category', async () => {
    await expect(service.fail({ ...request, errorCategory: 'token=secret provider failed' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not claim a terminal WorkflowRun', async () => {
    run.status = WorkflowStatus.SUCCESS;
    expect(await service.claim(request)).toMatchObject({
      claimed: false, reason: 'RUN_NOT_ACTIVE', status: WorkflowStatus.SUCCESS,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
