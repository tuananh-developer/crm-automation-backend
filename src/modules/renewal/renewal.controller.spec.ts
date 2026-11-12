/* eslint-disable @typescript-eslint/unbound-method */
import { RenewalController } from './renewal.controller.js';
import type { RenewalService } from './renewal.service.js';
import type { RenewalDraft } from './entities/renewal-draft.entity.js';
import type { Contract } from './entities/contract.entity.js';

describe('RenewalController', () => {
  let controller: RenewalController;
  let service: jest.Mocked<RenewalService>;

  beforeEach(() => {
    service = {
      findRenewalContracts: jest.fn(),
      getContract: jest.fn(),
      calculateUrgency: jest.fn(),
      saveDraft: jest.fn(),
      checkEligibility: jest.fn(),
      recordRenewalAttempt: jest.fn(),
    } as unknown as jest.Mocked<RenewalService>;

    controller = new RenewalController(service);
  });

  it('delegates finding contracts due for renewal with numeric days window', async () => {
    service.findRenewalContracts.mockResolvedValue([
      { id: 'contract-1' } as Contract,
    ]);

    const res = await controller.getRenewalContracts('45');
    expect(service.findRenewalContracts).toHaveBeenCalledWith(45);
    expect(res).toHaveLength(1);
  });

  it('delegates getting single contract by id', async () => {
    service.getContract.mockResolvedValue({ id: 'c-uuid-1' } as Contract);
    const res = await controller.getContract('c-uuid-1');
    expect(service.getContract).toHaveBeenCalledWith('c-uuid-1');
    expect(res).toMatchObject({ id: 'c-uuid-1' });
  });

  it('calculates urgency through canonical service logic', () => {
    service.calculateUrgency.mockReturnValue({
      level: 'CRITICAL',
      daysRemaining: 5,
    });
    const res = controller.calculateUrgency({
      renewalDate: '2026-11-20T00:00:00.000Z',
    });
    expect(service.calculateUrgency).toHaveBeenCalled();
    expect(res).toEqual({ level: 'CRITICAL', daysRemaining: 5 });
  });

  it('delegates draft saving', async () => {
    service.saveDraft.mockResolvedValue({ id: 'draft-uuid-1' } as RenewalDraft);
    const res = await controller.saveDraft({
      contractId: 'c-1',
      customerId: 'cust-1',
      idempotencyKey: 'key-1',
    });
    expect(service.saveDraft).toHaveBeenCalledWith({
      contractId: 'c-1',
      customerId: 'cust-1',
      idempotencyKey: 'key-1',
    });
    expect(res).toMatchObject({ id: 'draft-uuid-1' });
  });

  it('validates draft groundedness against source contract and customer IDs', () => {
    const validPayload = {
      contractId: 'c-1',
      customerId: 'cust-1',
      renewalDate: '2026-12-01',
      sourceContractId: 'c-1',
      sourceCustomerId: 'cust-1',
    };
    expect(controller.validateDraft(validPayload)).toMatchObject({
      valid: true,
      missing: [],
      contractMatch: true,
      customerMatch: true,
    });

    const mismatchPayload = {
      contractId: 'c-1',
      customerId: 'cust-1',
      renewalDate: '2026-12-01',
      sourceContractId: 'c-2',
      sourceCustomerId: 'cust-1',
    };
    expect(controller.validateDraft(mismatchPayload)).toMatchObject({
      valid: false,
      contractMatch: false,
    });
  });

  it('delegates authoritative eligibility verification to the service', async () => {
    service.checkEligibility.mockResolvedValue({
      canAutoSend: false,
      reason: 'FAIL_CLOSED: no backend consent record',
    });

    const res = await controller.checkEligibility({
      contractId: 'c-1',
      customerId: 'cust-1',
      draftId: 'd-1',
      hasConsent: true,
    });

    expect(service.checkEligibility).toHaveBeenCalledWith({
      contractId: 'c-1',
      customerId: 'cust-1',
      draftId: 'd-1',
      hasConsent: true,
    });
    expect(res.canAutoSend).toBe(false);
  });

  it('delegates recording attempt to service', async () => {
    service.recordRenewalAttempt.mockResolvedValue({
      id: 'd-1',
      status: 'SENT',
    } as RenewalDraft);

    const res = await controller.recordAttempt({
      contractId: 'c-1',
      status: 'SENT',
      idempotencyKey: 'attempt-1',
    });

    expect(service.recordRenewalAttempt).toHaveBeenCalled();
    expect(res).toMatchObject({ status: 'SENT' });
  });
});
