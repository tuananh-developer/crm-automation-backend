import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { AccountHealthController } from './account-health.controller.js';
import { AccountHealthService } from './account-health.service.js';
import type { Repository } from 'typeorm';
import type { AccountHealthSnapshot } from './entities/account-health-snapshot.entity.js';
import type { Customer } from './entities/customer.entity.js';

describe('AccountHealthController', () => {
  let controller: AccountHealthController;
  let service: AccountHealthService;
  let snapshotRepo: jest.Mocked<Partial<Repository<AccountHealthSnapshot>>>;
  let customerRepo: jest.Mocked<Partial<Repository<Customer>>>;

  const mockCustomer = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Strategic Account Corp',
    isStrategic: true,
  } as Customer;

  const mockSnapshot = {
    id: 'snap-1',
    customerId: mockCustomer.id,
    score: 80,
    status: 'HEALTHY',
    assessedAt: new Date(),
  } as AccountHealthSnapshot;

  beforeEach(() => {
    service = new AccountHealthService();
    snapshotRepo = {
      create: jest
        .fn()
        .mockImplementation((dto) => ({ id: 'snap-created', ...dto })),
      save: jest
        .fn()
        .mockImplementation((snap) =>
          Promise.resolve({ ...snap, id: 'snap-saved' }),
        ),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    customerRepo = {
      findOne: jest.fn().mockResolvedValue(mockCustomer),
    };

    controller = new AccountHealthController(
      service,
      snapshotRepo as Repository<AccountHealthSnapshot>,
      customerRepo as Repository<Customer>,
    );
  });

  describe('calculate', () => {
    it('calculates score and saves snapshot when customer exists and data is sufficient', async () => {
      const result = await controller.calculate({
        customerId: mockCustomer.id,
        engagement: 80,
        feedback: 80,
        openIssues: 80,
        followUpCompletion: 80,
      });

      expect(result.score).toBe(80);
      expect(result.status).toBe('HEALTHY');
      expect(customerRepo.findOne).toHaveBeenCalledWith({
        where: { id: mockCustomer.id },
      });
      expect(snapshotRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('snap-saved');
    });

    it('does not save snapshot when status is INSUFFICIENT_DATA', async () => {
      const result = await controller.calculate({
        customerId: mockCustomer.id,
        engagement: 80,
        feedback: null,
        openIssues: 80,
        followUpCompletion: 80,
      });

      expect(result.status).toBe('INSUFFICIENT_DATA');
      expect(snapshotRepo.save).not.toHaveBeenCalled();
      expect(result.id).toBeUndefined();
    });

    it('throws NotFoundException when customerId does not exist in DB', async () => {
      customerRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        controller.calculate({
          customerId: 'non-existent-uuid',
          engagement: 80,
          feedback: 80,
          openIssues: 80,
          followUpCompletion: 80,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reuses recent existing snapshot for idempotency on workflow retry', async () => {
      const recentSnapshot = {
        id: 'existing-snap-id',
        customerId: mockCustomer.id,
        score: 80,
        status: 'HEALTHY',
        assessedAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
      } as AccountHealthSnapshot;

      snapshotRepo.findOne = jest.fn().mockResolvedValue(recentSnapshot);

      const result = await controller.calculate({
        customerId: mockCustomer.id,
        engagement: 80,
        feedback: 80,
        openIssues: 80,
        followUpCompletion: 80,
      });

      expect(snapshotRepo.save).not.toHaveBeenCalled();
      expect(result.id).toBe('existing-snap-id');
    });
  });

  describe('getHistory', () => {
    it('returns history ordered by assessedAt DESC', async () => {
      snapshotRepo.find = jest.fn().mockResolvedValue([mockSnapshot]);

      const history = await controller.getHistory(mockCustomer.id);
      expect(history).toEqual([mockSnapshot]);
      expect(snapshotRepo.find).toHaveBeenCalledWith({
        where: { customerId: mockCustomer.id },
        order: { assessedAt: 'DESC' },
      });
    });
  });

  describe('validateActions', () => {
    it('accepts allowed actions with matching customerId and snapshotId evidence', () => {
      const result = controller.validateActions({
        customerId: 'cust-1',
        snapshotId: 'snap-1',
        actions: [
          {
            type: 'CREATE_RETENTION_TASK',
            evidence: [{ customerId: 'cust-1', snapshotId: 'snap-1' }],
          },
          {
            type: 'ESCALATE_RISK',
            evidence: [{ customerId: 'cust-1', snapshotId: 'snap-1' }],
          },
        ],
      });

      expect(result.valid).toHaveLength(2);
      expect(result.rejected).toBe(0);
      expect(result.success).toBe(true);
    });

    it('rejects disallowed action types or mismatched evidence', () => {
      const result = controller.validateActions({
        customerId: 'cust-1',
        snapshotId: 'snap-1',
        actions: [
          {
            type: 'DELETE_CUSTOMER', // not allowed
            evidence: [{ customerId: 'cust-1', snapshotId: 'snap-1' }],
          },
          {
            type: 'SCHEDULE_REVIEW',
            evidence: [{ customerId: 'cust-WRONG', snapshotId: 'snap-1' }], // mismatched
          },
        ],
      });

      expect(result.valid).toHaveLength(0);
      expect(result.rejected).toBe(2);
      expect(result.success).toBe(false);
    });
  });

  describe('validateAiOutput', () => {
    it('validates AI JSON output when all required keys match and score matches', () => {
      const result = controller.validateAiOutput({
        score: 75,
        aiOutput: {
          score: 75,
          summary: 'Good account',
          keyEvidence: ['Strong interaction'],
          risks: [],
          opportunities: ['Upgrade'],
          recommendedActions: ['SCHEDULE_REVIEW'],
          actionPriority: 'MEDIUM',
          evidenceReferences: ['snap-1'],
        },
      });

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.scoreMismatch).toBe(false);
    });

    it('detects score mismatch when AI invents its own score', () => {
      const result = controller.validateAiOutput({
        score: 75,
        aiOutput: {
          score: 95, // mismatch
          summary: 'Good account',
          keyEvidence: [],
          risks: [],
          opportunities: [],
          recommendedActions: [],
          actionPriority: 'LOW',
          evidenceReferences: [],
        },
      });

      expect(result.valid).toBe(false);
      expect(result.scoreMismatch).toBe(true);
    });

    it('parses stringified JSON aiOutput safely', () => {
      const stringified = JSON.stringify({
        score: 80,
        summary: 'Account healthy',
        keyEvidence: [],
        risks: [],
        opportunities: [],
        recommendedActions: [],
        actionPriority: 'LOW',
        evidenceReferences: [],
      });

      const result = controller.validateAiOutput({
        score: 80,
        aiOutput: stringified,
      });

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });
});
