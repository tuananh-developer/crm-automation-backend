import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { NextBestActionsService, WF10_NAME } from './next-best-actions.service.js';

describe('NextBestActionsService entity context', () => {
  const workflowRunId = '11111111-1111-4111-8111-111111111111';
  const leadId = '22222222-2222-4222-8222-222222222222';
  const workflowRuns = { findOne: jest.fn() };
  const leads = { findOne: jest.fn() };
  const customers = { findOne: jest.fn() };
  const executionClaims = { claim: jest.fn() };
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

  it('returns only the scoped lead profile for an active WF10 run', async () => {
    const lead = { id: leadId, firstName: 'Alex', lastName: 'Nguyen', email: 'alex@example.test' };
    workflowRuns.findOne.mockResolvedValue({ id: workflowRunId, workflowName: WF10_NAME, leadId, customerId: null, status: WorkflowStatus.PENDING });
    leads.findOne.mockResolvedValue(lead);
    await expect(service.getEntityProfile('Lead', leadId, workflowRunId))
      .resolves.toEqual({ data: { ...lead, entityType: 'Lead' } });
    expect(workflowRuns.findOne).toHaveBeenCalledWith({ where: { id: workflowRunId, workflowName: WF10_NAME, leadId } });
    expect(leads.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: leadId },
      select: expect.objectContaining({ id: true, email: true, phone: true, ownerId: true }),
    }));
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
    leads.findOne.mockResolvedValue({ id: leadId, email: 'alex@example.test' });
    executionClaims.claim.mockResolvedValue({ claimed: true });

    await expect(
      service.claimAndGetEntityContext({
        entityType: 'Lead',
        entityId: leadId,
        workflowRunId,
        n8nExecutionId: 'n8n-execution-1',
      }),
    ).resolves.toEqual({
      data: { id: leadId, email: 'alex@example.test', entityType: 'Lead' },
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

  it('rejects context reads for terminal workflow runs', async () => {
    workflowRuns.findOne.mockResolvedValue({ id: workflowRunId, workflowName: WF10_NAME, leadId, customerId: null, status: WorkflowStatus.SUCCESS });
    await expect(service.getEntityProfile('Lead', leadId, workflowRunId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(leads.findOne).not.toHaveBeenCalled();
  });
});
