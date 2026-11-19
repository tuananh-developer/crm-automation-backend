import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { NextBestActionRecommendation } from './entities/next-best-action-recommendation.entity.js';
import { NextBestActionsService, WF10_NAME } from './next-best-actions.service.js';

describe('NextBestActionsService callback ownership', () => {
  const workflowRunId = '11111111-1111-4111-8111-111111111111';
  const leadId = '22222222-2222-4222-8222-222222222222';
  const executionId = 'n8n-execution-1';
  let run: WorkflowRun;
  let workflowRuns: { findOne: jest.Mock };
  let runRepository: { findOne: jest.Mock; save: jest.Mock };
  let recommendationRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: NextBestActionsService;

  const callback = () => ({
    workflowRunId,
    n8nExecutionId: executionId,
    entityType: 'Lead' as const,
    entityId: leadId,
    recommendations: [{
      actionCode: 'REVIEW_ACCOUNT_CONTEXT',
      rank: 1,
      confidence: 0.9,
      explanation: 'Review recent account activity.',
      evidenceIds: [],
      requiresApproval: false,
    }],
    source: 'AI_NEXT_BEST_ACTION' as const,
    status: 'COMPLETED' as const,
  });

  beforeEach(() => {
    run = {
      id: workflowRunId,
      workflowName: WF10_NAME,
      n8nExecutionId: executionId,
      claimExpiresAt: new Date(Date.now() + 60_000),
      leadId,
      customerId: null,
      triggeredByUserId: 'owner-1',
      status: WorkflowStatus.RUNNING,
      inputPayload: {},
      outputPayload: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
      idempotencyKey: null,
      createdAt: new Date(),
    };

    workflowRuns = { findOne: jest.fn().mockResolvedValue(run) };
    runRepository = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(run)),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    recommendationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'recommendation-1', ...value })),
    };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity === WorkflowRun) return runRepository;
        if (entity === NextBestActionRecommendation) return recommendationRepository;
        throw new Error(`Unexpected repository: ${entity.name}`);
      }),
    };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
      ),
    };

    service = new NextBestActionsService(
      workflowRuns as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as unknown as DataSource,
      {} as never,
      {} as never,
    );
  });

  it('persists a recommendation only for the active execution owner and releases the lease', async () => {
    await expect(service.saveRecommendation(callback())).resolves.toMatchObject({
      recommendationId: 'recommendation-1',
      workflowRunId,
      reused: false,
    });
    expect(recommendationRepository.save).toHaveBeenCalledTimes(1);
    expect(runRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowStatus.SUCCESS,
      claimExpiresAt: null,
      finishedAt: expect.any(Date),
    }));
  });

  it('keeps the claim active until a human-approval recommendation is finalized', async () => {
    const approvalCallback = callback();
    approvalCallback.recommendations[0].actionCode = 'SCHEDULE_DISCOVERY_CALL';

    await expect(service.saveRecommendation(approvalCallback)).resolves.toMatchObject({
      recommendationId: 'recommendation-1',
      requiresHumanApproval: true,
    });
    expect(runRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowStatus.RUNNING,
      claimExpiresAt: expect.any(Date),
      finishedAt: null,
      outputPayload: expect.objectContaining({
        recommendationId: 'recommendation-1',
        requiresHumanApproval: true,
      }),
    }));
  });

  it('rejects a callback from a different execution after a lease takeover', async () => {
    run.n8nExecutionId = 'newer-execution';
    await expect(service.saveRecommendation(callback())).rejects.toBeInstanceOf(ConflictException);
    expect(recommendationRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a callback after the current execution lease expires', async () => {
    run.claimExpiresAt = new Date(Date.now() - 1_000);
    await expect(service.saveRecommendation(callback())).rejects.toBeInstanceOf(ConflictException);
    expect(recommendationRepository.save).not.toHaveBeenCalled();
  });

  it('returns an idempotent result when the same execution retries after success', async () => {
    run.status = WorkflowStatus.SUCCESS;
    run.claimExpiresAt = null;
    run.finishedAt = new Date();
    const expectedPayload = callback().recommendations.map((item) => ({
      ...item,
      requiresApproval: false,
    }));
    recommendationRepository.findOne.mockResolvedValue({
      id: 'recommendation-1',
      entityType: 'Lead',
      entityId: leadId,
      recommendations: expectedPayload,
      requiresHumanApproval: false,
      status: 'RECOMMENDED',
    });

    await expect(service.saveRecommendation(callback())).resolves.toMatchObject({
      recommendationId: 'recommendation-1',
      workflowRunId,
      reused: true,
    });
    expect(recommendationRepository.save).not.toHaveBeenCalled();
  });
});
