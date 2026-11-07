import { ConflictException } from '@nestjs/common';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ProductCatalogItem } from './entities/product-catalog-item.entity.js';
import { Quote } from './entities/quote.entity.js';
import { QuoteItem } from './entities/quote-item.entity.js';
import { QuotesService, WF12_NAME } from './quotes.service.js';

describe('QuotesService workflow execution ownership', () => {
  const workflowRunId = '11111111-1111-4111-8111-111111111111';
  const customerId = '22222222-2222-4222-8222-222222222222';
  const catalogItemId = '33333333-3333-4333-8333-333333333333';
  const executionId = 'n8n-execution-1';
  const requestedItems = [{ catalogItemId, quantity: 2 }];
  let run: WorkflowRun;
  let workflowRunRepository: { findOne: jest.Mock; save: jest.Mock };
  let catalogRepository: { find: jest.Mock };
  let quoteRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let quoteItemRepository: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let config: { get: jest.Mock };
  let service: QuotesService;

  const draft = () => ({
    workflowRunId,
    n8nExecutionId: executionId,
    customerId,
    leadId: null,
    title: 'CRM automation proposal',
    executiveSummary: 'A proposal for the CRM team.',
    body: 'Implementation and onboarding services.',
    items: requestedItems,
    currency: 'VND',
  });

  const catalogItem = {
    id: catalogItemId,
    sku: 'CRM-001',
    name: 'CRM Automation',
    description: 'CRM automation package',
    unitPrice: '100.00',
    currency: 'VND',
    taxRatePercent: '10.00',
    isActive: true,
  };

  beforeEach(() => {
    run = {
      id: workflowRunId,
      workflowName: WF12_NAME,
      n8nExecutionId: executionId,
      claimExpiresAt: new Date(Date.now() + 60_000),
      leadId: null,
      customerId,
      triggeredByUserId: 'sales-owner',
      status: WorkflowStatus.RUNNING,
      inputPayload: {
        customerId,
        leadId: null,
        requestedItems,
        currency: 'VND',
      },
      outputPayload: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
      idempotencyKey: workflowRunId,
      createdAt: new Date(),
    } as WorkflowRun;

    workflowRunRepository = {
      findOne: jest.fn().mockResolvedValue(run),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    catalogRepository = {
      find: jest.fn().mockResolvedValue([catalogItem]),
    };
    quoteRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'quote-1', ...value })),
    };
    quoteItemRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity === WorkflowRun) return workflowRunRepository;
        if (entity === ProductCatalogItem) return catalogRepository;
        if (entity === Quote) return quoteRepository;
        if (entity === QuoteItem) return quoteItemRepository;
        throw new Error(`Unexpected repository: ${entity.name}`);
      }),
    };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    config = { get: jest.fn().mockReturnValue('1000') };

    service = new QuotesService(
      { findOne: jest.fn().mockResolvedValue(run) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      {} as never,
      config as never,
      { heartbeat: jest.fn().mockResolvedValue({ renewed: true }) } as never,
    );
  });

  it('creates a quote using backend catalog amounts and clears the lease on completion', async () => {
    await expect(service.saveDraft(draft())).resolves.toMatchObject({
      id: 'quote-1',
      workflowRunId,
      subtotal: '200.00',
      taxTotal: '20.00',
      totalAmount: '220.00',
      currency: 'VND',
      approvalRequired: false,
      reused: false,
    });
    expect(quoteRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      subtotal: '200.00',
      taxTotal: '20.00',
      totalAmount: '220.00',
      pricingSnapshot: expect.objectContaining({ currency: 'VND', subtotal: '200.00', totalAmount: '220.00' }),
    }));
    expect(quoteItemRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        quantity: 2,
        unitPriceSnapshot: '100.00',
        lineSubtotal: '200.00',
        lineTax: '20.00',
      }),
    ]);
    expect(workflowRunRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowStatus.SUCCESS,
      claimExpiresAt: null,
      finishedAt: expect.any(Date),
    }));
  });

  it('rejects a stale execution before persisting a quote', async () => {
    run.n8nExecutionId = 'newer-execution';
    await expect(service.saveDraft(draft())).rejects.toBeInstanceOf(ConflictException);
    expect(quoteRepository.save).not.toHaveBeenCalled();
    expect(quoteItemRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a callback after its active execution lease expires', async () => {
    run.claimExpiresAt = new Date(Date.now() - 1_000);
    await expect(service.saveDraft(draft())).rejects.toBeInstanceOf(ConflictException);
    expect(quoteRepository.save).not.toHaveBeenCalled();
  });

  it('reuses an identical quote when the owning execution retries after completion', async () => {
    run.status = WorkflowStatus.SUCCESS;
    run.claimExpiresAt = null;
    run.finishedAt = new Date();
    quoteRepository.findOne.mockResolvedValue({
      id: 'quote-1',
      workflowRunId,
      title: draft().title,
      executiveSummary: draft().executiveSummary,
      body: draft().body,
      currency: 'VND',
      status: 'DRAFT',
      approvalRequired: false,
      totalAmount: '220.00',
    });
    quoteItemRepository.find.mockResolvedValue([{
      catalogItemId,
      quantity: 2,
    }]);

    await expect(service.saveDraft(draft())).resolves.toMatchObject({
      id: 'quote-1',
      workflowRunId,
      reused: true,
    });
    expect(quoteRepository.save).not.toHaveBeenCalled();
    expect(quoteItemRepository.save).not.toHaveBeenCalled();
  });
});
