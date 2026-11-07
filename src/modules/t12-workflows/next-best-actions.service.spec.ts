import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { NextBestActionsService, WF10_NAME } from './next-best-actions.service.js';

describe('NextBestActionsService entity context', () => {
  const workflowRunId = '11111111-1111-4111-8111-111111111111';
  const leadId = '22222222-2222-4222-8222-222222222222';
  const workflowRuns = { findOne: jest.fn() };
  const leads = { findOne: jest.fn() };
  const customers = { findOne: jest.fn() };
  const executionClaims = { claim: jest.fn(), heartbeat: jest.fn() };
  const emptyRepository = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
  let service: NextBestActionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NextBestActionsService(
      workflowRuns as never, leads as never, customers as never,
      emptyRepository as never, emptyRepository as never, emptyRepository as never,
      emptyRepository as never, emptyRepository as never, emptyRepository as never,
      emptyRepository as never, emptyRepository as never, {} as never, {} as never,
      executionClaims as never,
    );
  });

  it('returns only non-identifying business attributes for a scoped WF10 Lead', async () => {
    const lead = {
      id: leadId,
      companyName: 'Acme',
      companyWebsite: 'https://acme.example',
      jobTitle: 'CTO',
      companySize: 120,
      industry: 'Software',
      status: 'QUALIFIED',
    };
    workflowRuns.findOne.mockResolvedValue({ id: workflowRunId, workflowName: WF10_NAME, leadId, customerId: null, status: WorkflowStatus.PENDING });
    leads.findOne.mockResolvedValue(lead);
    await expect(service.getEntityProfile('Lead', leadId, workflowRunId))
      .resolves.toEqual({ data: { ...lead, entityType: 'Lead' } });
    expect(workflowRuns.findOne).toHaveBeenCalledWith({ where: { id: workflowRunId, workflowName: WF10_NAME, leadId } });
    expect(leads.findOne).toHaveBeenCalledWith({
      where: { id: leadId },
      select: {
        id: true,
        companyName: true,
        companyWebsite: true,
        jobTitle: true,
        companySize: true,
        industry: true,
        status: true,
      },
    });
    const { data } = await service.getEntityProfile('Lead', leadId, workflowRunId);
    for (const field of ['firstName', 'lastName', 'email', 'phone', 'ownerId']) {
      expect(data).not.toHaveProperty(field);
    }
  });

  it('does not expose a profile when the WorkflowRun is not scoped to the entity', async () => {
    workflowRuns.findOne.mockResolvedValue(null);
    await expect(service.getEntityProfile('Lead', leadId, workflowRunId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(leads.findOne).not.toHaveBeenCalled();
  });

  it('claims an active run before returning entity context', async () => {
    workflowRuns.findOne.mockResolvedValue({
      id: workflowRunId,
      workflowName: WF10_NAME,
      leadId,
      customerId: null,
      status: WorkflowStatus.PENDING,
    });
    leads.findOne.mockResolvedValue({
      id: leadId,
      companyName: 'Acme',
      companyWebsite: 'https://acme.example',
      jobTitle: 'CTO',
      companySize: 120,
      industry: 'Software',
      status: 'QUALIFIED',
    });
    executionClaims.claim.mockResolvedValue({ claimed: true });

    await expect(
      service.claimAndGetEntityContext({
        entityType: 'Lead',
        entityId: leadId,
        workflowRunId,
        n8nExecutionId: 'n8n-execution-1',
      }),
    ).resolves.toEqual({
      data: {
        id: leadId,
        companyName: 'Acme',
        companyWebsite: 'https://acme.example',
        jobTitle: 'CTO',
        companySize: 120,
        industry: 'Software',
        status: 'QUALIFIED',
        entityType: 'Lead',
      },
    });
    expect(executionClaims.claim).toHaveBeenCalledWith({
      workflowRunId,
      workflowName: WF10_NAME,
      n8nExecutionId: 'n8n-execution-1',
    });
  });

  it('rejects a competing execution before returning entity context', async () => {
    workflowRuns.findOne.mockResolvedValue({
      id: workflowRunId,
      workflowName: WF10_NAME,
      leadId,
      customerId: null,
      status: WorkflowStatus.RUNNING,
    });
    leads.findOne.mockResolvedValue({ id: leadId, email: 'alex@example.test' });
    executionClaims.claim.mockResolvedValue({ claimed: false });

    await expect(
      service.claimAndGetEntityContext({
        entityType: 'Lead',
        entityId: leadId,
        workflowRunId,
        n8nExecutionId: 'n8n-execution-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('renews the active execution lease before returning follow-up and segment context', async () => {
    workflowRuns.findOne.mockResolvedValue({
      id: workflowRunId,
      workflowName: WF10_NAME,
      leadId,
      customerId: null,
      status: WorkflowStatus.RUNNING,
    });

    await expect(
      service.getFollowUpSegmentContext(
        'Lead',
        leadId,
        workflowRunId,
        'n8n-execution-1',
      ),
    ).resolves.toMatchObject({
      followUps: [],
      segments: [],
      allowedActions: expect.any(Array),
    });

    expect(executionClaims.heartbeat).toHaveBeenCalledWith({
      workflowRunId,
      workflowName: WF10_NAME,
      n8nExecutionId: 'n8n-execution-1',
    });
  });

  it('does not return follow-up context when the lease heartbeat rejects a stale execution', async () => {
    workflowRuns.findOne.mockResolvedValue({
      id: workflowRunId,
      workflowName: WF10_NAME,
      leadId,
      customerId: null,
      status: WorkflowStatus.RUNNING,
    });
    executionClaims.heartbeat.mockRejectedValue(new ConflictException(
      'Workflow execution no longer owns this claim',
    ));

    await expect(
      service.getFollowUpSegmentContext(
        'Lead',
        leadId,
        workflowRunId,
        'stale-execution',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(emptyRepository.find).not.toHaveBeenCalled();
  });

  it('returns company-only Customer context without contact identifiers', async () => {
    const customerId = '33333333-3333-4333-8333-333333333333';
    workflowRuns.findOne.mockResolvedValue({
      id: workflowRunId,
      workflowName: WF10_NAME,
      customerId,
      leadId: null,
      status: WorkflowStatus.PENDING,
    });
    customers.findOne.mockResolvedValue({
      id: customerId,
      companyName: 'Acme',
      companyWebsite: 'https://acme.example',
      jobTitle: 'CFO',
      companySize: 80,
      industry: 'Software',
      status: 'ACTIVE',
    });

    await expect(service.getEntityProfile('Customer', customerId, workflowRunId))
      .resolves.toEqual({
        data: {
          id: customerId,
          companyName: 'Acme',
          companyWebsite: 'https://acme.example',
          jobTitle: 'CFO',
          companySize: 80,
          industry: 'Software',
          status: 'ACTIVE',
          entityType: 'Customer',
        },
      });
    expect(customers.findOne).toHaveBeenCalledWith({
      where: { id: customerId },
      select: {
        id: true,
        companyName: true,
        companyWebsite: true,
        jobTitle: true,
        companySize: true,
        industry: true,
        status: true,
      },
    });
  });

  it('returns interaction evidence metadata without subjects or message contents', async () => {
    workflowRuns.findOne.mockResolvedValue({
      id: workflowRunId,
      workflowName: WF10_NAME,
      leadId,
      customerId: null,
      status: WorkflowStatus.RUNNING,
    });
    emptyRepository.find.mockResolvedValue([{
      id: 'interaction-1',
      leadId,
      type: 'CALL',
      channel: 'PHONE',
      subject: 'Sensitive subject',
      content: 'Sensitive customer conversation',
      occurredAt: new Date(),
    }]);

    const result = await service.getInteractionHistory('Lead', leadId, workflowRunId);

    expect(result.items).toEqual([{
      id: 'interaction-1',
      type: 'CALL',
      channel: 'PHONE',
      occurredAt: expect.any(Date),
    }]);
    expect(emptyRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        type: true,
        channel: true,
        occurredAt: true,
      },
    }));
  });

  it('rejects context reads for terminal workflow runs', async () => {
    workflowRuns.findOne.mockResolvedValue({ id: workflowRunId, workflowName: WF10_NAME, leadId, customerId: null, status: WorkflowStatus.SUCCESS });
    await expect(service.getEntityProfile('Lead', leadId, workflowRunId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(leads.findOne).not.toHaveBeenCalled();
  });
});
