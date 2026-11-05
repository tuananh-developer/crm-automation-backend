import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataCleaningService } from './data-cleaning.service.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import type { AuditLog } from '../audit/entities/audit-log.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';
import type { DataCleaningFinding } from './interfaces/data-cleaning.interface.js';

describe('DataCleaningService', () => {
  let service: DataCleaningService;
  let leadsRepository: jest.Mocked<Partial<Repository<Lead>>>;
  let workflowRunRepository: jest.Mocked<Partial<Repository<WorkflowRun>>>;
  let auditLogRepository: jest.Mocked<Partial<Repository<AuditLog>>>;
  let rabbitmqService: jest.Mocked<Partial<RabbitMQService>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let mockEntityManager: jest.Mocked<Partial<EntityManager>>;

  const mockLead: Lead = {
    id: 'lead-uuid-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    companyName: 'Acme Corp',
    companyWebsite: 'http://acme.com',
    jobTitle: 'Sales Director',
    companySize: 100,
    industry: 'Software',
    status: LeadStatus.NEW,
    sourceId: 'source-1',
    ownerId: null,
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFinding: DataCleaningFinding = {
    id: 'finding-uuid-1',
    recordType: 'Lead',
    recordId: 'lead-uuid-1',
    leadIdentifier: 'John Doe (john.doe@example.com)',
    fieldName: 'email',
    issueType: 'CASE_NORMALIZATION',
    severity: 'LOW',
    currentValue: 'john.doe@example.com',
    proposedValue: 'john.doe@example.com',
    confidence: 1.0,
    reason: 'Normalized lowercase and trimmed whitespace',
    safeToApply: true,
    requiresHumanApproval: true,
  };

  const mockWorkflowRun: WorkflowRun = {
    id: 'wf-uuid-1',
    workflowName: 'UC10_DATA_CLEANING',
    status: WorkflowStatus.PENDING,
    n8nExecutionId: null,
    leadId: null,
    customerId: null,
    triggeredByUserId: 'user-uuid-1',
    inputPayload: { scope: 'ALL', filter: null },
    outputPayload: null,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    leadsRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    workflowRunRepository = {
      create: jest
        .fn()
        .mockImplementation((val) => ({ id: 'wf-uuid-1', ...val })),
      save: jest
        .fn()
        .mockImplementation((val) =>
          Promise.resolve({ id: 'wf-uuid-1', ...val }),
        ),
      findOne: jest.fn(),
    };

    auditLogRepository = {
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    rabbitmqService = {
      publishDataCleaningRequested: jest.fn().mockResolvedValue({} as any),
    };

    mockEntityManager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
      create: jest.fn().mockImplementation((_, val) => val),
    };

    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (em: EntityManager) => Promise<unknown>) => {
          return cb(mockEntityManager as EntityManager);
        }),
    };

    service = new DataCleaningService(
      leadsRepository as Repository<Lead>,
      workflowRunRepository as Repository<WorkflowRun>,
      auditLogRepository as Repository<AuditLog>,
      rabbitmqService as RabbitMQService,
      dataSource as DataSource,
    );
  });

  describe('createScan', () => {
    it('should create a WorkflowRun and publish event to RabbitMQ', async () => {
      const result = await service.createScan({ scope: 'ALL' }, 'user-uuid-1');

      expect(workflowRunRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 'UC10_DATA_CLEANING',
          status: WorkflowStatus.PENDING,
          triggeredByUserId: 'user-uuid-1',
        }),
      );
      expect(workflowRunRepository.save).toHaveBeenCalled();
      expect(rabbitmqService.publishDataCleaningRequested).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowRunId: 'wf-uuid-1',
          scope: 'ALL',
        }),
      );
      expect(result).toEqual({
        workflowRunId: 'wf-uuid-1',
        status: WorkflowStatus.PENDING,
        message: 'Data cleaning scan initiated successfully',
      });
    });

    it('should survive RabbitMQ failure in resilient fallback mode', async () => {
      (
        rabbitmqService.publishDataCleaningRequested as jest.Mock
      ).mockRejectedValueOnce(new Error('Broker unreachable'));

      const result = await service.createScan({ scope: 'ALL' });
      expect(result.workflowRunId).toBe('wf-uuid-1');
      expect(result.status).toBe(WorkflowStatus.PENDING);
    });
  });

  describe('getScan', () => {
    it('should return scan report when WorkflowRun exists', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockWorkflowRun,
        status: WorkflowStatus.SUCCESS,
        outputPayload: {
          summary: { totalLeadsScanned: 10, totalIssuesFound: 1 },
          findings: [mockFinding],
        },
      });

      const result = await service.getScan('wf-uuid-1');
      expect(result.workflowRunId).toBe('wf-uuid-1');
      expect(result.status).toBe(WorkflowStatus.SUCCESS);
      expect(result.findings).toHaveLength(1);
    });

    it('should throw NotFoundException if WorkflowRun is not found', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.getScan('wf-non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('handleCallback', () => {
    it('should update WorkflowRun status and store output findings', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockWorkflowRun,
      });

      const callbackDto = {
        workflowRunId: 'wf-uuid-1',
        status: 'SUCCESS' as const,
        summary: {
          totalLeadsScanned: 50,
          totalIssuesFound: 2,
          issuesByType: { INVALID_EMAIL: 1, INCONSISTENT_PHONE: 1 },
          issuesBySeverity: { MEDIUM: 2 },
          duplicatesFound: 0,
          safeToApplyCount: 2,
        },
        findings: [mockFinding],
      };

      const result = await service.handleCallback(callbackDto);

      expect(workflowRunRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: WorkflowStatus.SUCCESS,
          outputPayload: expect.objectContaining({
            findings: [mockFinding],
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowStatus.SUCCESS);
    });

    it('should throw NotFoundException if workflow run not found on callback', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.handleCallback({
          workflowRunId: 'wf-unknown',
          status: 'SUCCESS',
          summary: {} as any,
          findings: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyCleaning', () => {
    let completedWorkflowRun: WorkflowRun;

    beforeEach(() => {
      completedWorkflowRun = {
        ...mockWorkflowRun,
        status: WorkflowStatus.SUCCESS,
        outputPayload: {
          findings: [
            mockFinding,
            {
              id: 'finding-uuid-website',
              recordType: 'Lead',
              recordId: 'lead-uuid-1',
              fieldName: 'companyWebsite',
              issueType: 'INVALID_WEBSITE',
              severity: 'LOW',
              currentValue: 'http://acme.com',
              proposedValue: 'https://acme.com',
              confidence: 0.98,
              reason: 'Enforce HTTPS',
              safeToApply: true,
              requiresHumanApproval: true,
            },
          ],
        },
      };
    });

    it('should apply accepted findings in a transaction and create AuditLog', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        completedWorkflowRun,
      );

      (mockEntityManager.findOne as jest.Mock).mockImplementation(
        (entity, opts) => {
          if (opts.where.id === 'lead-uuid-1') {
            return Promise.resolve({ ...mockLead });
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.applyCleaning(
        'wf-uuid-1',
        { acceptedFindingIds: ['finding-uuid-website'] },
        'user-uuid-1',
      );

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalled();
      expect(result.appliedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.results[0].status).toBe('APPLIED');
      expect(result.results[0].newValue).toBe('https://acme.com');
    });

    it('should skip fields that are not in the whitelist', async () => {
      const nonWhitelistedFinding: DataCleaningFinding = {
        id: 'finding-hack-1',
        recordType: 'Lead',
        recordId: 'lead-uuid-1',
        fieldName: 'passwordHash', // Not in whitelist!
        issueType: 'INCONSISTENT_DATA',
        severity: 'CRITICAL',
        currentValue: 'oldHash',
        proposedValue: 'newHash',
        confidence: 1.0,
        reason: 'Hack attempt',
        safeToApply: true,
        requiresHumanApproval: true,
      };

      const wfWithBadFinding: WorkflowRun = {
        ...mockWorkflowRun,
        status: WorkflowStatus.SUCCESS,
        outputPayload: { findings: [nonWhitelistedFinding] },
      };

      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        wfWithBadFinding,
      );

      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
      });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-hack-1'],
      });

      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.results[0].status).toBe('SKIPPED');
      expect(result.results[0].skipReason).toContain('not whitelisted');
    });

    it('should skip finding if lead data changed since scan was run (concurrency check)', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        completedWorkflowRun,
      );

      // Lead in database has already been updated to something different than scanned currentValue
      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
        companyWebsite: 'https://updated-externally.com',
      });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-uuid-website'],
      });

      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.results[0].status).toBe('SKIPPED');
      expect(result.results[0].skipReason).toContain('Lead data has changed');
    });

    it('should prevent email update if new email is already taken by another lead', async () => {
      const emailFinding: DataCleaningFinding = {
        id: 'finding-email-dup',
        recordType: 'Lead',
        recordId: 'lead-uuid-1',
        fieldName: 'email',
        issueType: 'CASE_NORMALIZATION',
        severity: 'LOW',
        currentValue: 'john.doe@example.com',
        proposedValue: 'taken@example.com',
        confidence: 1.0,
        reason: 'Change email',
        safeToApply: true,
        requiresHumanApproval: true,
      };

      const wfWithEmailFinding: WorkflowRun = {
        ...mockWorkflowRun,
        status: WorkflowStatus.SUCCESS,
        outputPayload: { findings: [emailFinding] },
      };

      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        wfWithEmailFinding,
      );

      // First findOne returns mockLead, second findOne checks email uniqueness and finds another lead!
      (mockEntityManager.findOne as jest.Mock)
        .mockResolvedValueOnce({ ...mockLead })
        .mockResolvedValueOnce({
          id: 'lead-uuid-2',
          email: 'taken@example.com',
        });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-email-dup'],
      });

      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.results[0].status).toBe('SKIPPED');
      expect(result.results[0].skipReason).toContain('already taken');
    });

    it('should throw BadRequestException if workflow is not in SUCCESS status', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockWorkflowRun,
        status: WorkflowStatus.RUNNING,
      });

      await expect(
        service.applyCleaning('wf-uuid-1', { acceptedFindingIds: ['f-1'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip finding if already applied previously', async () => {
      const alreadyAppliedWf: WorkflowRun = {
        ...completedWorkflowRun,
        outputPayload: {
          ...completedWorkflowRun.outputPayload,
          appliedFindingIds: ['finding-uuid-website'],
        },
      };

      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        alreadyAppliedWf,
      );

      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
      });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-uuid-website'],
      });

      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.results[0].status).toBe('SKIPPED');
      expect(result.results[0].skipReason).toBe(
        'Finding has already been applied',
      );
    });

    it('should handle duplicate finding IDs in the same request idempotently without applying twice', async () => {
      // Finding appears once in scan findings, but client sends duplicate ID in acceptedFindingIds
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        completedWorkflowRun,
      );

      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
      });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-uuid-website', 'finding-uuid-website'],
      });

      // The finding is matched and applied on first occurrence, second duplicate occurrence is skipped
      expect(result.appliedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.totalRequested).toBe(2);
      expect(result.results[1].status).toBe('SKIPPED');
      expect(result.results[1].skipReason).toBe(
        'Finding has already been applied',
      );
    });

    it('should be completely idempotent when applyCleaning is called repeatedly with the same payload', async () => {
      const previouslyCompletedWf: WorkflowRun = {
        ...completedWorkflowRun,
        outputPayload: {
          ...completedWorkflowRun.outputPayload,
          appliedFindingIds: ['finding-uuid-website'],
        },
      };

      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        previouslyCompletedWf,
      );

      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
        companyWebsite: 'https://acme-corp.com',
      });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-uuid-website'],
      });

      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.results[0].status).toBe('SKIPPED');
      expect(result.results[0].skipReason).toBe(
        'Finding has already been applied',
      );
      // Lead should not be updated in DB
      expect(mockEntityManager.save).toHaveBeenCalledTimes(1); // Only saving workflowRun output payload, not lead
    });

    it('should skip finding if safeToApply is not true', async () => {
      const unsafeFinding: DataCleaningFinding = {
        id: 'finding-unsafe-1',
        recordType: 'Lead',
        recordId: 'lead-uuid-1',
        fieldName: 'companyWebsite',
        issueType: 'INVALID_WEBSITE',
        severity: 'HIGH',
        currentValue: 'http://acme.com',
        proposedValue: 'https://acme.com',
        confidence: 0.5,
        reason: 'Unsure format',
        safeToApply: false,
        requiresHumanApproval: true,
      };

      const wfWithUnsafeFinding: WorkflowRun = {
        ...mockWorkflowRun,
        status: WorkflowStatus.SUCCESS,
        outputPayload: { findings: [unsafeFinding] },
      };

      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        wfWithUnsafeFinding,
      );

      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
      });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-unsafe-1'],
      });

      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.results[0].status).toBe('SKIPPED');
      expect(result.results[0].skipReason).toBe(
        'Finding is not safe to apply automatically',
      );
    });

    it('should persist merged appliedFindingIds into outputPayload on success', async () => {
      const existingWf: WorkflowRun = {
        ...completedWorkflowRun,
        outputPayload: {
          ...completedWorkflowRun.outputPayload,
          appliedFindingIds: ['finding-uuid-prev'],
        },
      };

      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        existingWf,
      );

      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
      });

      const result = await service.applyCleaning('wf-uuid-1', {
        acceptedFindingIds: ['finding-uuid-website'],
      });

      expect(result.appliedCount).toBe(1);
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          outputPayload: expect.objectContaining({
            appliedFindingIds: ['finding-uuid-prev', 'finding-uuid-website'],
          }),
        }),
      );
    });

    it('should prioritize userId over dto.userId and workflowRun.triggeredByUserId for audit log', async () => {
      (workflowRunRepository.findOne as jest.Mock).mockResolvedValueOnce(
        completedWorkflowRun,
      );

      (mockEntityManager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockLead,
      });

      await service.applyCleaning(
        'wf-uuid-1',
        {
          acceptedFindingIds: ['finding-uuid-website'],
          userId: 'dto-user-id',
        },
        'jwt-user-id',
      );

      expect(mockEntityManager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'jwt-user-id',
        }),
      );
    });
  });
});
