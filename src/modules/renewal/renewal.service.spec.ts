/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type Repository } from 'typeorm';
import { RenewalService } from './renewal.service.js';
import type { Contract } from './entities/contract.entity.js';
import type { RenewalDraft } from './entities/renewal-draft.entity.js';
import type { Customer } from '../customers/entities/customer.entity.js';

describe('RenewalService', () => {
  let service: RenewalService;
  let contractRepo: jest.Mocked<Repository<Contract>>;
  let draftRepo: jest.Mocked<Repository<RenewalDraft>>;
  let customerRepo: jest.Mocked<Repository<Customer>>;

  beforeEach(() => {
    contractRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((val) => val),
      save: jest
        .fn()
        .mockImplementation((val) =>
          Promise.resolve({ id: 'contract-saved-id', ...val }),
        ),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<Contract>>;

    draftRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((val) => val),
      save: jest
        .fn()
        .mockImplementation((val) =>
          Promise.resolve({ id: 'draft-saved-id', ...val }),
        ),
    } as unknown as jest.Mocked<Repository<RenewalDraft>>;

    customerRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Customer>>;

    service = new RenewalService(contractRepo, draftRepo, customerRepo);
  });

  describe('Contract Management', () => {
    it('creates a contract successfully when customer exists and dates are valid', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'customer-1' } as Customer);
      contractRepo.findOne.mockResolvedValue(null);

      const result = await service.createContract({
        customerId: 'customer-1',
        contractNumber: 'CTR-2026-001',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-31T23:59:59.000Z',
        amount: 15000,
      });

      expect(result).toMatchObject({
        customerId: 'customer-1',
        contractNumber: 'CTR-2026-001',
        status: 'ACTIVE',
      });
      expect(contractRepo.save).toHaveBeenCalled();
    });

    it('rejects contract creation when customer does not exist', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createContract({
          customerId: 'non-existent-customer',
          contractNumber: 'CTR-002',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects contract creation when startDate is after endDate', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'customer-1' } as Customer);

      await expect(
        service.createContract({
          customerId: 'customer-1',
          contractNumber: 'CTR-003',
          startDate: '2026-12-31',
          endDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects contract creation when contractNumber already exists', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'customer-1' } as Customer);
      contractRepo.findOne.mockResolvedValue({
        id: 'existing-contract',
        contractNumber: 'CTR-DUPLICATE',
      } as unknown as Contract);

      await expect(
        service.createContract({
          customerId: 'customer-1',
          contractNumber: 'CTR-DUPLICATE',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when getting non-existent contract', async () => {
      contractRepo.findOne.mockResolvedValue(null);
      await expect(service.getContract('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates a contract status and renewalDate', async () => {
      const existing = {
        id: 'contract-1',
        status: 'ACTIVE',
        renewalDate: null,
      } as unknown as Contract;
      contractRepo.findOne.mockResolvedValue(existing);

      await service.updateContract('contract-1', {
        status: 'RENEWED',
        renewalDate: '2027-01-01T00:00:00.000Z',
      });

      expect(contractRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'RENEWED',
        }),
      );
    });
  });

  describe('calculateUrgency', () => {
    it('handles null or invalid dates safely with UNKNOWN and -1 days', () => {
      expect(service.calculateUrgency(null)).toEqual({
        level: 'UNKNOWN',
        daysRemaining: -1,
      });
      expect(service.calculateUrgency(new Date('invalid'))).toEqual({
        level: 'UNKNOWN',
        daysRemaining: -1,
      });
    });

    it('identifies EXPIRED contracts for dates in the past', () => {
      const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const res = service.calculateUrgency(past);
      expect(res.level).toBe('EXPIRED');
      expect(res.daysRemaining).toBeLessThan(0);
    });

    it('identifies CRITICAL urgency for <= 7 days', () => {
      const date3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      expect(service.calculateUrgency(date3).level).toBe('CRITICAL');

      const date7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(service.calculateUrgency(date7).level).toBe('CRITICAL');
    });

    it('identifies HIGH urgency for > 7 and <= 30 days', () => {
      const date15 = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      expect(service.calculateUrgency(date15).level).toBe('HIGH');

      const date30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      expect(service.calculateUrgency(date30).level).toBe('HIGH');
    });

    it('identifies MEDIUM urgency for > 30 and <= 60 days', () => {
      const date45 = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
      expect(service.calculateUrgency(date45).level).toBe('MEDIUM');

      const date60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      expect(service.calculateUrgency(date60).level).toBe('MEDIUM');
    });

    it('identifies LOW urgency for > 60 days', () => {
      const date90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      expect(service.calculateUrgency(date90).level).toBe('LOW');
    });
  });

  describe('Draft Management & Idempotency', () => {
    it('returns existing draft when idempotencyKey is reused', async () => {
      const existing = {
        id: 'draft-existing-1',
        idempotencyKey: 'key-123',
        status: 'DRAFT',
      } as unknown as RenewalDraft;
      draftRepo.findOne.mockResolvedValue(existing);

      const result = await service.saveDraft({
        contractId: 'contract-1',
        customerId: 'customer-1',
        idempotencyKey: 'key-123',
      });

      expect(result).toBe(existing);
      expect(draftRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if idempotencyKey is missing', async () => {
      await expect(
        service.saveDraft({
          contractId: 'contract-1',
          customerId: 'customer-1',
          idempotencyKey: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if target contract does not exist', async () => {
      draftRepo.findOne.mockResolvedValue(null);
      contractRepo.findOne.mockResolvedValue(null);

      await expect(
        service.saveDraft({
          contractId: 'non-existent-contract',
          customerId: 'customer-1',
          idempotencyKey: 'key-456',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if customerId does not match contract customerId', async () => {
      draftRepo.findOne.mockResolvedValue(null);
      contractRepo.findOne.mockResolvedValue({
        id: 'contract-1',
        customerId: 'customer-real',
      } as unknown as Contract);

      await expect(
        service.saveDraft({
          contractId: 'contract-1',
          customerId: 'customer-imposter',
          idempotencyKey: 'key-789',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('records renewal attempt idempotently', async () => {
      const existing = {
        id: 'draft-1',
        idempotencyKey: 'attempt-key-1',
        status: 'DRAFT',
      } as unknown as RenewalDraft;
      draftRepo.findOne.mockResolvedValue(existing);

      const result = await service.recordRenewalAttempt({
        contractId: 'contract-1',
        status: 'SENT',
        idempotencyKey: 'attempt-key-1',
        communicationId: 'comm-123',
      });

      expect(result.status).toBe('SENT');
      expect(result.communicationId).toBe('comm-123');
      expect(draftRepo.save).toHaveBeenCalled();
    });
  });

  describe('Authoritative Security: checkEligibility', () => {
    it('1. Rejects caller-supplied hasConsent: true when database has no consent', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);
      draftRepo.findOne.mockResolvedValue({
        id: 'd-1',
        contractId: 'c-1',
        customerId: 'cust-1',
        validationResult: {
          consentGranted: false, // Authoritative missing
          templateApproved: true,
          policyApproved: true,
          approvedBy: 'admin-1',
        },
      } as unknown as RenewalDraft);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
        hasConsent: true, // Caller lie
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toBe('FAIL_CLOSED: no backend consent record');
    });

    it('2. Rejects caller-supplied hasTemplate: true when template is not approved in backend', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);
      draftRepo.findOne.mockResolvedValue({
        id: 'd-1',
        contractId: 'c-1',
        customerId: 'cust-1',
        validationResult: {
          consentGranted: true,
          templateApproved: false, // Authoritative missing
          policyApproved: true,
          approvedBy: 'admin-1',
        },
      } as unknown as RenewalDraft);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
        hasTemplate: true, // Caller lie
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toBe('FAIL_CLOSED: no backend template record');
    });

    it('3. Rejects caller-supplied policyAllows: true when policy does not permit', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);
      draftRepo.findOne.mockResolvedValue({
        id: 'd-1',
        contractId: 'c-1',
        customerId: 'cust-1',
        validationResult: {
          consentGranted: true,
          templateApproved: true,
          policyApproved: false, // Authoritative missing
          approvedBy: 'admin-1',
        },
      } as unknown as RenewalDraft);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
        policyAllows: true, // Caller lie
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toBe('FAIL_CLOSED: no backend policy record');
    });

    it('4. Rejects caller-supplied needsApproval: false when approval record is missing', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);
      draftRepo.findOne.mockResolvedValue({
        id: 'd-1',
        contractId: 'c-1',
        customerId: 'cust-1',
        status: 'DRAFT',
        validationResult: {
          consentGranted: true,
          templateApproved: true,
          policyApproved: true,
          approvedBy: undefined, // Authoritative missing
        },
      } as unknown as RenewalDraft);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
        needsApproval: false, // Caller lie
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toBe('FAIL_CLOSED: no backend approval record');
    });

    it('5. Rejects caller supplying all 4 favorable booleans when backend records are empty', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);
      draftRepo.findOne.mockResolvedValue({
        id: 'd-1',
        contractId: 'c-1',
        customerId: 'cust-1',
        validationResult: {}, // Empty metadata
      } as unknown as RenewalDraft);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
        hasConsent: true,
        hasTemplate: true,
        policyAllows: true,
        needsApproval: false,
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toMatch(/FAIL_CLOSED/);
    });

    it('6. Rejects when contract belongs to a different customer', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-2', // Mismatch
        draftId: 'd-1',
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toBe('FAIL_CLOSED: contract not found');
    });

    it('7. Rejects when draft belongs to a different contract', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);
      draftRepo.findOne.mockResolvedValue({
        id: 'd-1',
        contractId: 'c-other', // Mismatch
        customerId: 'cust-1',
        validationResult: {},
      } as unknown as RenewalDraft);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toBe('FAIL_CLOSED: draft not found');
    });

    it('8. Rejects non-existent contract ID', async () => {
      contractRepo.findOne.mockResolvedValue(null);

      const res = await service.checkEligibility({
        contractId: 'non-existent-contract',
        customerId: 'cust-1',
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toBe('FAIL_CLOSED: contract not found');
    });

    it('9. Rejects inactive or cancelled contracts', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'CANCELLED',
      } as unknown as Contract);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
      });
      expect(res.canAutoSend).toBe(false);
      expect(res.reason).toContain('CANCELLED');
    });

    it('10. Approves auto-send ONLY when all authoritative backend records exist', async () => {
      contractRepo.findOne.mockResolvedValue({
        id: 'c-1',
        customerId: 'cust-1',
        status: 'ACTIVE',
      } as unknown as Contract);
      draftRepo.findOne.mockResolvedValue({
        id: 'd-1',
        contractId: 'c-1',
        customerId: 'cust-1',
        status: 'APPROVED',
        validationResult: {
          consentGranted: true,
          templateApproved: true,
          policyApproved: true,
          approvedBy: 'admin-uuid',
        },
      } as unknown as RenewalDraft);

      const res = await service.checkEligibility({
        contractId: 'c-1',
        customerId: 'cust-1',
        draftId: 'd-1',
      });
      expect(res.canAutoSend).toBe(true);
      expect(res.reason).toBe('OK');
    });
  });
});
