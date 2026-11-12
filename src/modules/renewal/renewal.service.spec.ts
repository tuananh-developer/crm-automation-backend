import { type Repository } from 'typeorm';
import { RenewalService } from './renewal.service.js';
import type { Contract } from './entities/contract.entity.js';
import type { RenewalDraft } from './entities/renewal-draft.entity.js';

describe('RenewalService', () => {
  const contractRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<Repository<Contract>>;
  const draftRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<Repository<RenewalDraft>>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes urgency from actual renewal dates and handles expired contracts safely', () => {
    const service = new RenewalService(contractRepo, draftRepo);

    expect(
      service.calculateUrgency(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
    ).toMatchObject({
      level: 'CRITICAL',
      daysRemaining: expect.any(Number),
    });
    expect(
      service.calculateUrgency(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
    ).toMatchObject({
      level: 'EXPIRED',
      daysRemaining: expect.any(Number),
    });
    expect(service.calculateUrgency(null)).toMatchObject({
      level: 'UNKNOWN',
      daysRemaining: -1,
    });
  });

  it('rejects caller-supplied consent/template/policy/approval booleans when backend authority is missing', async () => {
    const service = new RenewalService(contractRepo, draftRepo);
    contractRepo.findOne.mockResolvedValue({
      id: 'contract-1',
      customerId: 'customer-1',
      status: 'ACTIVE',
      renewalDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    } as unknown as Contract);
    draftRepo.findOne.mockResolvedValue({
      id: 'draft-1',
      contractId: 'contract-1',
      customerId: 'customer-1',
      status: 'DRAFT',
      idempotencyKey: 'draft-1',
    } as unknown as RenewalDraft);

    await expect(
      service.checkEligibility({
        contractId: 'contract-1',
        customerId: 'customer-1',
        draftId: 'draft-1',
        hasConsent: true,
        hasTemplate: true,
        policyAllows: true,
        needsApproval: false,
      }),
    ).resolves.toMatchObject({
      canAutoSend: false,
      reason: expect.stringContaining('FAIL_CLOSED'),
    });
  });

  it('prevents duplicate renewal drafts when the same idempotency key is reused', async () => {
    const service = new RenewalService(contractRepo, draftRepo);
    const existing = {
      id: 'draft-1',
      contractId: 'contract-1',
      customerId: 'customer-1',
      status: 'DRAFT',
      idempotencyKey: 'duplicate-key',
    } as unknown as RenewalDraft;
    draftRepo.findOne.mockResolvedValue(existing);

    await expect(
      service.saveDraft({
        contractId: 'contract-1',
        customerId: 'customer-1',
        idempotencyKey: 'duplicate-key',
        status: 'DRAFT',
      }),
    ).resolves.toMatchObject({
      id: 'draft-1',
      idempotencyKey: 'duplicate-key',
    });
  });
});
