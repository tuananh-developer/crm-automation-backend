import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { Quote } from './entities/quote.entity.js';
import { QuoteApproval } from './entities/quote-approval.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { User } from '../users/entities/user.entity.js';
import { QuotesService, WF12_NAME } from './quotes.service.js';
import type { SubmitQuoteApprovalDto } from './dto/index.js';

describe('QuotesService approval workflow', () => {
  const workflowRunId = '11111111-1111-4111-8111-111111111111';
  const quoteId = '22222222-2222-4222-8222-222222222222';
  const n8nExecutionId = 'n8n-execution-1';
  let run: WorkflowRun;
  let quote: Quote;
  let runRepository: { findOne: jest.Mock; save: jest.Mock };
  let quoteRepository: { findOne: jest.Mock; save: jest.Mock };
  let approvalRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let notificationRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let userRepository: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: QuotesService;

  const dto: SubmitQuoteApprovalDto = {
    workflowRunId,
    n8nExecutionId,
    idempotencyKey: workflowRunId,
  };

  beforeEach(() => {
    run = {
      id: workflowRunId,
      workflowName: WF12_NAME,
      n8nExecutionId,
      claimExpiresAt: new Date(Date.now() + 60_000),
      status: WorkflowStatus.RUNNING,
      outputPayload: {},
    } as WorkflowRun;
    quote = {
      id: quoteId,
      workflowRunId,
      createdBy: 'sales-owner',
      customerId: 'customer-1',
      leadId: null,
      status: 'DRAFT',
      approvalRequired: true,
      submittedForApprovalAt: null,
    } as Quote;

    runRepository = {
      findOne: jest.fn().mockResolvedValue(run),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    quoteRepository = {
      findOne: jest.fn().mockResolvedValue(quote),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    approvalRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation((value) => Promise.resolve({ id: 'approval-1', ...value })),
    };
    notificationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation((value) =>
        Promise.resolve({ id: 'notification-1', ...value }),
      ),
    };
    userRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
    };

    const manager = {
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity === WorkflowRun) return runRepository;
        if (entity === Quote) return quoteRepository;
        if (entity === QuoteApproval) return approvalRepository;
        if (entity === Notification) return notificationRepository;
        if (entity === User) return userRepository;
        throw new Error(`Unexpected repository: ${entity.name}`);
      }),
    };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
      ),
    };

    service = new QuotesService(
      runRepository as never,
      {} as never,
      {} as never,
      {} as never,
      quoteRepository as never,
      {} as never,
      approvalRepository as never,
      notificationRepository as never,
      userRepository as never,
      dataSource as unknown as DataSource,
      {} as never,
      { get: jest.fn().mockReturnValue('0') } as never,
      { heartbeat: jest.fn().mockResolvedValue({ renewed: true }) } as never,
    );
  });

  it('submits a priced quote for approval and releases the workflow execution lease', async () => {
    const result = await service.submitForApproval(quoteId, dto, workflowRunId);

    expect(result).toMatchObject({
      quoteId,
      approvalId: 'approval-1',
      approvalRequired: true,
      status: 'PENDING_APPROVAL',
      reused: false,
    });
    expect(approvalRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      quoteId,
      requestedBy: 'sales-owner',
      status: 'PENDING',
      idempotencyKey: `wf12:${workflowRunId}:approval`,
    }));
    expect(quoteRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PENDING_APPROVAL',
      submittedForApprovalAt: expect.any(Date),
    }));
    expect(runRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowStatus.PARTIAL,
      claimExpiresAt: null,
      finishedAt: null,
      outputPayload: expect.objectContaining({
        quoteId,
        approvalId: 'approval-1',
      }),
    }));
    expect(notificationRepository.save).toHaveBeenCalledTimes(2);
    expect(notificationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'sales-owner',
      idempotencyKey: `wf12:${workflowRunId}:approver:sales-owner`,
    }));
    expect(notificationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1',
      idempotencyKey: `wf12:${workflowRunId}:approver:admin-1`,
    }));
  });

  it('rejects approval submission from an execution that no longer owns the quote claim', async () => {
    run.n8nExecutionId = 'recovered-execution';
    run.claimExpiresAt = new Date(Date.now() + 60_000);

    await expect(
      service.submitForApproval(quoteId, dto, workflowRunId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(approvalRepository.save).not.toHaveBeenCalled();
    expect(quoteRepository.save).not.toHaveBeenCalled();
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });

  it('reuses the same approval and notification identities on an idempotent retry', async () => {
    run.status = WorkflowStatus.PARTIAL;
    run.claimExpiresAt = null;
    quote.status = 'PENDING_APPROVAL';
    approvalRepository.findOne.mockResolvedValue({
      id: 'approval-1',
      quoteId,
      status: 'PENDING',
    });
    notificationRepository.findOne.mockResolvedValue({
      id: 'notification-existing',
      userId: 'sales-owner',
    });
    userRepository.find.mockResolvedValue([]);

    const result = await service.submitForApproval(quoteId, dto, workflowRunId);

    expect(result).toMatchObject({
      quoteId,
      approvalId: 'approval-1',
      status: 'PENDING_APPROVAL',
      reused: true,
    });
    expect(approvalRepository.save).not.toHaveBeenCalled();
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });
});
