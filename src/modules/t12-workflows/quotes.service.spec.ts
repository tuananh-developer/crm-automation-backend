import { NotFoundException } from '@nestjs/common';
import { QuotesService, WF12_NAME } from './quotes.service.js';

describe('QuotesService entity context', () => {
  const workflowRunId = '11111111-1111-4111-8111-111111111111';
  const customerId = '22222222-2222-4222-8222-222222222222';
  const runs = { findOne: jest.fn() };
  const leads = { findOne: jest.fn() };
  const customers = { findOne: jest.fn() };
  const executionClaims = { claim: jest.fn() };
  const emptyRepository = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
  let service: QuotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QuotesService(
      runs as never, leads as never, customers as never,
      emptyRepository as never, emptyRepository as never, emptyRepository as never,
      emptyRepository as never, emptyRepository as never, emptyRepository as never,
      {} as never, {} as never, { get: jest.fn().mockReturnValue('0') } as never,
      executionClaims as never,
    );
  });

  it('returns only non-identifying business attributes for the scoped WF12 customer', async () => {
    const customer = {
      id: customerId,
      companyName: 'Acme',
      companyWebsite: 'https://acme.example',
      jobTitle: 'Procurement',
      industry: 'Software',
    };
    runs.findOne.mockResolvedValue({ id: workflowRunId, workflowName: WF12_NAME, customerId, leadId: null });
    customers.findOne.mockResolvedValue(customer);
    await expect(service.getEntityContext(customerId, undefined, workflowRunId))
      .resolves.toEqual({ entityType: 'Customer', entity: customer, workflowRunId });
    expect(runs.findOne).toHaveBeenCalledWith({ where: { id: workflowRunId, workflowName: WF12_NAME } });
    expect(customers.findOne).toHaveBeenCalledWith({
      where: { id: customerId },
      select: {
        id: true,
        companyName: true,
        companyWebsite: true,
        jobTitle: true,
        industry: true,
      },
    });
    const result = await service.getEntityContext(customerId, undefined, workflowRunId);
    for (const field of ['name', 'email', 'phone', 'createdBy']) {
      expect(result.entity).not.toHaveProperty(field);
    }
  });

  it('returns business-only Lead context without individual contact identifiers', async () => {
    const leadId = '33333333-3333-4333-8333-333333333333';
    runs.findOne.mockResolvedValue({
      id: workflowRunId,
      workflowName: WF12_NAME,
      customerId: null,
      leadId,
    });
    leads.findOne.mockResolvedValue({
      id: leadId,
      companyName: 'Acme',
      companyWebsite: 'https://acme.example',
      jobTitle: 'Buyer',
      industry: 'Software',
    });

    await expect(service.getEntityContext(undefined, leadId, workflowRunId))
      .resolves.toEqual({
        entityType: 'Lead',
        entity: {
          id: leadId,
          companyName: 'Acme',
          companyWebsite: 'https://acme.example',
          jobTitle: 'Buyer',
          industry: 'Software',
        },
        workflowRunId,
      });
    expect(leads.findOne).toHaveBeenCalledWith({
      where: { id: leadId },
      select: {
        id: true,
        companyName: true,
        companyWebsite: true,
        jobTitle: true,
        industry: true,
      },
    });
  });

  it('claims an active run before returning customer context', async () => {
    const customer = {
      id: customerId,
      companyName: 'Acme',
      companyWebsite: 'https://acme.example',
      jobTitle: 'Procurement',
      industry: 'Software',
    };
    runs.findOne.mockResolvedValue({
      id: workflowRunId, workflowName: WF12_NAME, customerId, leadId: null,
    });
    customers.findOne.mockResolvedValue(customer);
    executionClaims.claim.mockResolvedValue({ claimed: true });

    await expect(service.claimAndGetEntityContext({
      customerId, workflowRunId, n8nExecutionId: 'n8n-execution-1',
    })).resolves.toEqual({ entityType: 'Customer', entity: customer, workflowRunId });
    expect(executionClaims.claim).toHaveBeenCalledWith({
      workflowRunId, workflowName: WF12_NAME, n8nExecutionId: 'n8n-execution-1',
    });
  });

  it('rejects a competing execution before returning customer context', async () => {
    runs.findOne.mockResolvedValue({
      id: workflowRunId, workflowName: WF12_NAME, customerId, leadId: null,
    });
    customers.findOne.mockResolvedValue({ id: customerId, name: 'Acme Ltd' });
    executionClaims.claim.mockResolvedValue({ claimed: false });

    await expect(service.claimAndGetEntityContext({
      customerId, workflowRunId, n8nExecutionId: 'n8n-execution-2',
    })).rejects.toThrow(
      'WorkflowRun is already claimed by another n8n execution or is no longer active',
    );
  });

  it('does not load a customer for a WorkflowRun owned by another entity', async () => {
    runs.findOne.mockResolvedValue({ id: workflowRunId, workflowName: WF12_NAME, customerId: '33333333-3333-4333-8333-333333333333', leadId: null });
    await expect(service.getEntityContext(customerId, undefined, workflowRunId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(customers.findOne).not.toHaveBeenCalled();
  });

  it('requires exactly one scoped entity identifier', async () => {
    await expect(service.getEntityContext(undefined, undefined, workflowRunId))
      .rejects.toThrow('workflowRunId and exactly one entity ID are required');
    expect(runs.findOne).not.toHaveBeenCalled();
  });
});
