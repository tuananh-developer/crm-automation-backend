import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { ReviewTask } from '../review/entities/review-task.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { NextBestActionRecommendation } from './entities/next-best-action-recommendation.entity.js';
import { NextBestActionsService, WF10_NAME } from './next-best-actions.service.js';

describe('NextBestActionsService final review gate', () => {
  const workflowRunId = '11111111-1111-4111-8111-111111111111';
  const customerId = '22222222-2222-4222-8222-222222222222';
  const executionId = 'n8n-execution-1';
  let run: WorkflowRun;
  let recommendation: NextBestActionRecommendation;
  let workflowRuns: { findOne: jest.Mock };
  let runRepository: { findOne: jest.Mock; save: jest.Mock };
  let recommendationRepository: { findOne: jest.Mock; save: jest.Mock };
  let notificationRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let reviewTaskRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let customerRepository: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: NextBestActionsService;

  const dto = () => ({
    workflowRunId,
    n8nExecutionId: executionId,
    entityType: 'Customer' as const,
    entityId: customerId,
    recommendationId: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: workflowRunId,
  });

  beforeEach(() => {
    run = {
      id: workflowRunId,
      workflowName: WF10_NAME,
      n8nExecutionId: executionId,
      claimExpiresAt: new Date(Date.now() + 60_000),
      leadId: null,
      customerId,
      triggeredByUserId: 'owner-1',
      status: WorkflowStatus.RUNNING,
      inputPayload: {},
      outputPayload: {},
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
      idempotencyKey: null,
      createdAt: new Date(),
    };

    recommendation = {
      id: dto().recommendationId,
      workflowRunId,
      entityType: 'Customer',
      entityId: customerId,
      requiresHumanApproval: false,
      status: 'RECOMMENDED',
      reviewTaskId: null,
      recommendations: [],
    } as unknown as NextBestActionRecommendation;

    workflowRuns = { findOne: jest.fn().mockResolvedValue(run) };
    runRepository = {
      findOne: jest.fn().mockResolvedValue(run),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    recommendationRepository = {
      findOne: jest.fn().mockResolvedValue(recommendation),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    notificationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation((value) =>
        Promise.resolve({ id: 'notification-1', ...value }),
      ),
    };
    reviewTaskRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation((value) =>
        Promise.resolve({ id: 'review-task-1', ...value }),
      ),
    };
    customerRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: customerId,
        createdBy: 'owner-1',
      }),
    };

    const manager = {
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity === WorkflowRun) return runRepository;
        if (entity === NextBestActionRecommendation) return recommendationRepository;
        if (entity === Notification) return notificationRepository;
        if (entity === ReviewTask) return reviewTaskRepository;
        if (entity === Customer) return customerRepository;
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
      recommendationRepository as never,
      reviewTaskRepository as never,
      notificationRepository as never,
      dataSource as unknown as DataSource,
      {} as never,
      {} as never,
    );
  });

  it('finalizes a non-approval recommendation and releases the execution lease', async () => {
    recommendation.requiresHumanApproval = false;

    await expect(service.createReviewOrNotification(dto(), workflowRunId))
      .resolves.toMatchObject({
        approvalRequired: false,
        reviewTaskId: null,
        notificationFound: false,
      });

    expect(runRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowStatus.SUCCESS,
      claimExpiresAt: null,
      finishedAt: expect.any(Date),
      outputPayload: expect.objectContaining({
        reviewTaskId: null,
        notificationFound: false,
      }),
    }));
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });

  it('creates the owner notification and finalizes an approval-required recommendation as PARTIAL', async () => {
    recommendation.requiresHumanApproval = true;

    await expect(service.createReviewOrNotification(dto(), workflowRunId))
      .resolves.toMatchObject({
        approvalRequired: true,
        notificationFound: true,
        notificationMode: 'OWNER_NOTIFICATION',
      });

    expect(notificationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1',
      idempotencyKey: `wf10:${workflowRunId}:owner-1`,
    }));
    expect(runRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowStatus.PARTIAL,
      claimExpiresAt: null,
      finishedAt: null,
      outputPayload: expect.objectContaining({ notificationFound: true }),
    }));
  });

  it('rejects finalization from an execution that no longer owns the claim', async () => {
    run.n8nExecutionId = 'recovered-execution';

    await expect(service.createReviewOrNotification(dto(), workflowRunId))
      .rejects.toBeInstanceOf(ConflictException);

    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(runRepository.save).not.toHaveBeenCalled();
  });
});
