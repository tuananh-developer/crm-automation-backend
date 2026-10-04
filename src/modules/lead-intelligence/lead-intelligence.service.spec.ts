import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CONFIDENCE_THRESHOLD,
  DEFAULT_ENRICHMENT_PROVIDER,
  LeadIntelligenceService,
} from './lead-intelligence.service.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import {
  EnrichmentStatus,
  QualificationStatus,
} from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { ReviewStatus } from '../review/enums/review.enum.js';
import type { Repository } from 'typeorm';
import type { LeadQualification } from './entities/lead-qualification.entity.js';
import type { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import type { ReviewTask } from '../review/entities/review-task.entity.js';
import type { Notification } from '../notifications/entities/notification.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';

describe('LeadIntelligenceService', () => {
  let service: LeadIntelligenceService;
  let qualificationsRepo: jest.Mocked<Partial<Repository<LeadQualification>>>;
  let enrichmentsRepo: jest.Mocked<Partial<Repository<LeadEnrichment>>>;
  let leadsRepo: jest.Mocked<Partial<Repository<Lead>>>;
  let workflowRunsRepo: jest.Mocked<Partial<Repository<WorkflowRun>>>;
  let reviewTasksRepo: jest.Mocked<Partial<Repository<ReviewTask>>>;
  let notificationsRepo: jest.Mocked<Partial<Repository<Notification>>>;
  let rabbitmqService: jest.Mocked<Partial<RabbitMQService>>;

  const mockLead: Lead = {
    id: 'lead-123',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: null,
    companyName: 'Tech Innovations',
    companyWebsite: null,
    jobTitle: 'CTO',
    companySize: 100,
    industry: 'Software',
    status: LeadStatus.NEW,
    sourceId: 'source-123',
    ownerId: 'user-owner-123',
    convertedCustomerId: null,
    convertedBy: null,
    convertedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockWorkflowRun: WorkflowRun = {
    id: 'wf-run-123',
    workflowName: 'lead-qualification',
    n8nExecutionId: null,
    leadId: 'lead-123',
    customerId: null,
    triggeredByUserId: null,
    status: WorkflowStatus.PENDING,
    inputPayload: {},
    outputPayload: null,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
  };

  const mockQualification: LeadQualification = {
    id: 'qual-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    status: QualificationStatus.QUALIFIED,
    intent: 'Looking for CRM automation',
    confidence: 0.95,
    reason: 'Clear B2B intent and high budget match',
    modelProvider: 'openai',
    modelName: 'gpt-4o',
    modelVersion: '2024-08-06',
    inputSnapshot: {},
    outputSnapshot: {},
    createdAt: new Date(),
  };

  const mockEnrichment: LeadEnrichment = {
    id: 'enrich-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    provider: 'mock',
    externalRequestId: 'ext-req-123',
    status: EnrichmentStatus.PENDING,
    companyName: null,
    companyWebsite: null,
    companyIndustry: null,
    companySize: null,
    contactJobTitle: null,
    contactLinkedinUrl: null,
    rawResponse: null,
    errorMessage: null,
    enrichedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(() => {
    qualificationsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    enrichmentsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    leadsRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    workflowRunsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    reviewTasksRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    notificationsRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    rabbitmqService = {
      publishLeadQualificationRequested: jest.fn().mockResolvedValue({
        eventId: 'event-123',
        eventType: 'lead.qualification.requested',
        version: 1,
        occurredAt: new Date().toISOString(),
        data: { leadId: 'lead-123', workflowRunId: 'wf-run-123' },
      }),
      publishLeadEnrichmentRequested: jest.fn().mockResolvedValue({
        eventId: 'event-456',
        eventType: 'lead.enrichment.requested',
        version: 1,
        occurredAt: new Date().toISOString(),
        data: {
          leadId: 'lead-123',
          workflowRunId: 'wf-run-123',
          provider: 'mock',
        },
      }),
    };

    service = new LeadIntelligenceService(
      qualificationsRepo as Repository<LeadQualification>,
      enrichmentsRepo as Repository<LeadEnrichment>,
      leadsRepo as Repository<Lead>,
      workflowRunsRepo as Repository<WorkflowRun>,
      reviewTasksRepo as Repository<ReviewTask>,
      notificationsRepo as Repository<Notification>,
      rabbitmqService as RabbitMQService,
    );
  });

  describe('triggerQualification', () => {
    it('should throw NotFoundException if lead does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.triggerQualification('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should set status to QUALIFYING, create WorkflowRun, and publish event', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({ ...mockLead });
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );
      (workflowRunsRepo.create as jest.Mock).mockReturnValue(mockWorkflowRun);
      (workflowRunsRepo.save as jest.Mock).mockResolvedValue(mockWorkflowRun);

      const result = await service.triggerQualification('lead-123');

      expect(result.leadId).toBe('lead-123');
      expect(result.workflowRunId).toBe('wf-run-123');
      expect(leadsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.QUALIFYING }),
      );
      expect(workflowRunsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 'lead-qualification',
          leadId: 'lead-123',
          status: WorkflowStatus.PENDING,
        }),
      );
      expect(
        rabbitmqService.publishLeadQualificationRequested,
      ).toHaveBeenCalledWith({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
      });
    });
  });

  describe('handleQualificationCallback', () => {
    it('should throw NotFoundException if lead does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.handleQualificationCallback({
          leadId: 'invalid-id',
          status: QualificationStatus.QUALIFIED,
          confidence: 0.9,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should automatically accept high confidence qualification and update lead status to QUALIFIED', async () => {
      const currentLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (qualificationsRepo.create as jest.Mock).mockReturnValue(
        mockQualification,
      );
      (qualificationsRepo.save as jest.Mock).mockResolvedValue(
        mockQualification,
      );
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
      });
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const result = await service.handleQualificationCallback({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: QualificationStatus.QUALIFIED,
        confidence: 0.95,
        reason: 'Strong intent',
      });

      expect(result.reviewRequired).toBe(false);
      expect(result.leadStatus).toBe(LeadStatus.QUALIFIED);
      expect(reviewTasksRepo.create).not.toHaveBeenCalled();
      expect(notificationsRepo.create).not.toHaveBeenCalled();
      expect(leadsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeadStatus.QUALIFIED }),
      );
    });

    it('should automatically accept DISQUALIFIED with high confidence and update status to LOST', async () => {
      const currentLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (qualificationsRepo.create as jest.Mock).mockReturnValue({
        ...mockQualification,
        status: QualificationStatus.DISQUALIFIED,
      });
      (qualificationsRepo.save as jest.Mock).mockResolvedValue({
        ...mockQualification,
        status: QualificationStatus.DISQUALIFIED,
      });
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
      });
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const result = await service.handleQualificationCallback({
        leadId: 'lead-123',
        status: QualificationStatus.DISQUALIFIED,
        confidence: 0.88,
      });

      expect(result.reviewRequired).toBe(false);
      expect(result.leadStatus).toBe(LeadStatus.LOST);
    });

    it('should trigger human review and create ReviewTask and Notification when confidence < 0.80', async () => {
      const currentLead = { ...mockLead, status: LeadStatus.QUALIFYING };
      const lowConfidenceQual = {
        ...mockQualification,
        confidence: 0.65,
        status: QualificationStatus.QUALIFIED,
      };

      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (qualificationsRepo.create as jest.Mock).mockReturnValue(
        lowConfidenceQual,
      );
      (qualificationsRepo.save as jest.Mock).mockResolvedValue(
        lowConfidenceQual,
      );
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
      });
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const mockReviewTask: ReviewTask = {
        id: 'review-task-123',
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        assignedTo: 'user-owner-123',
        status: ReviewStatus.PENDING,
        reason: 'Low confidence',
        decision: null,
        reviewComment: null,
        createdAt: new Date(),
        startedAt: null,
        resolvedAt: null,
      };

      (reviewTasksRepo.create as jest.Mock).mockReturnValue(mockReviewTask);
      (reviewTasksRepo.save as jest.Mock).mockResolvedValue(mockReviewTask);
      (notificationsRepo.create as jest.Mock).mockReturnValue({
        id: 'notif-123',
      });
      (notificationsRepo.save as jest.Mock).mockResolvedValue({
        id: 'notif-123',
      });

      const result = await service.handleQualificationCallback({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: QualificationStatus.QUALIFIED,
        confidence: 0.65,
        reason: 'Ambiguous job title and budget not specified',
      });

      expect(result.reviewRequired).toBe(true);
      expect(result.reviewTaskId).toBe('review-task-123');
      expect(reviewTasksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-123',
          assignedTo: 'user-owner-123',
          status: ReviewStatus.PENDING,
        }),
      );
      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-owner-123',
          type: 'REVIEW_REQUIRED',
          leadId: 'lead-123',
          reviewTaskId: 'review-task-123',
        }),
      );
    });
  });

  describe('CONFIDENCE_THRESHOLD', () => {
    it('should be exactly 0.80 as specified by business requirements', () => {
      expect(CONFIDENCE_THRESHOLD).toBe(0.8);
    });
  });

  describe('triggerEnrichment', () => {
    it('should throw NotFoundException if lead does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.triggerEnrichment('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create WorkflowRun, create pending LeadEnrichment, and publish event with default provider', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({ ...mockLead });
      (workflowRunsRepo.create as jest.Mock).mockReturnValue({
        ...mockWorkflowRun,
        id: 'wf-run-enrich-1',
        workflowName: 'lead-enrichment',
      });
      (workflowRunsRepo.save as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
        id: 'wf-run-enrich-1',
        workflowName: 'lead-enrichment',
      });
      (enrichmentsRepo.create as jest.Mock).mockReturnValue({
        ...mockEnrichment,
        id: 'enrich-1',
        workflowRunId: 'wf-run-enrich-1',
      });
      (enrichmentsRepo.save as jest.Mock).mockResolvedValue({
        ...mockEnrichment,
        id: 'enrich-1',
        workflowRunId: 'wf-run-enrich-1',
      });

      const result = await service.triggerEnrichment('lead-123');

      expect(result.leadId).toBe('lead-123');
      expect(result.workflowRunId).toBe('wf-run-enrich-1');
      expect(result.enrichmentId).toBe('enrich-1');
      expect(workflowRunsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 'lead-enrichment',
          leadId: 'lead-123',
          status: WorkflowStatus.PENDING,
          inputPayload: expect.objectContaining({
            leadId: 'lead-123',
            provider: DEFAULT_ENRICHMENT_PROVIDER,
            email: 'alice@example.com',
          }),
        }),
      );
      expect(enrichmentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-123',
          workflowRunId: 'wf-run-enrich-1',
          provider: DEFAULT_ENRICHMENT_PROVIDER,
          status: EnrichmentStatus.PENDING,
        }),
      );
      expect(
        rabbitmqService.publishLeadEnrichmentRequested,
      ).toHaveBeenCalledWith({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-enrich-1',
        provider: DEFAULT_ENRICHMENT_PROVIDER,
        email: 'alice@example.com',
        companyName: 'Tech Innovations',
        companyWebsite: undefined,
      });
    });

    it('should respect custom provider and userId if provided in DTO', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({ ...mockLead });
      (workflowRunsRepo.create as jest.Mock).mockReturnValue({
        ...mockWorkflowRun,
        id: 'wf-run-enrich-custom',
      });
      (workflowRunsRepo.save as jest.Mock).mockResolvedValue({
        ...mockWorkflowRun,
        id: 'wf-run-enrich-custom',
      });
      (enrichmentsRepo.create as jest.Mock).mockReturnValue({
        ...mockEnrichment,
        id: 'enrich-custom',
        provider: 'clearbit',
      });
      (enrichmentsRepo.save as jest.Mock).mockResolvedValue({
        ...mockEnrichment,
        id: 'enrich-custom',
        provider: 'clearbit',
      });

      const result = await service.triggerEnrichment('lead-123', {
        userId: 'user-sales-456',
        provider: 'clearbit',
      });

      expect(result.workflowRunId).toBe('wf-run-enrich-custom');
      expect(workflowRunsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          triggeredByUserId: 'user-sales-456',
        }),
      );
      expect(enrichmentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'clearbit',
        }),
      );
    });
  });

  describe('handleEnrichmentCallback', () => {
    it('should throw NotFoundException if lead does not exist', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.handleEnrichmentCallback({
          leadId: 'invalid-lead-id',
          status: EnrichmentStatus.SUCCESS,
          provider: 'mock',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update LeadEnrichment to SUCCESS, update WorkflowRun to SUCCESS, and update lead profile fields', async () => {
      const currentLead = { ...mockLead, companyWebsite: null };
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(currentLead);
      (leadsRepo.save as jest.Mock).mockImplementation((l) =>
        Promise.resolve(l),
      );

      const pendingEnrichment = { ...mockEnrichment };
      (enrichmentsRepo.findOne as jest.Mock).mockResolvedValue(
        pendingEnrichment,
      );
      (enrichmentsRepo.save as jest.Mock).mockImplementation((e) =>
        Promise.resolve(e),
      );

      const pendingWfRun = {
        ...mockWorkflowRun,
        workflowName: 'lead-enrichment',
      };
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue(pendingWfRun);
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );

      const callbackDto = {
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: EnrichmentStatus.SUCCESS,
        provider: 'mock',
        externalRequestId: 'ext-req-789',
        companyName: 'Tech Innovations Global',
        companyWebsite: 'https://techinnovations.io',
        companyIndustry: 'Cloud Computing',
        companySize: 250,
        contactJobTitle: 'Chief Technology Officer',
        contactLinkedinUrl: 'https://linkedin.com/in/alicesmith',
        rawResponse: { source: 'mock-test', valid: true },
      };

      const result = await service.handleEnrichmentCallback(callbackDto);

      expect(result.workflowRunUpdated).toBe(true);
      expect(result.enrichment.status).toBe(EnrichmentStatus.SUCCESS);
      expect(result.enrichment.companyName).toBe('Tech Innovations Global');
      expect(result.enrichment.companyWebsite).toBe(
        'https://techinnovations.io',
      );
      expect(result.enrichment.companyIndustry).toBe('Cloud Computing');
      expect(result.enrichment.companySize).toBe(250);

      expect(leadsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: 'Tech Innovations Global',
          companyWebsite: 'https://techinnovations.io',
          industry: 'Cloud Computing',
          companySize: 250,
          jobTitle: 'Chief Technology Officer',
        }),
      );

      expect(workflowRunsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: WorkflowStatus.SUCCESS,
          errorMessage: null,
        }),
      );
    });

    it('should update LeadEnrichment and WorkflowRun to FAILED and record error message on failure', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({ ...mockLead });
      const pendingEnrichment = { ...mockEnrichment };
      (enrichmentsRepo.findOne as jest.Mock).mockResolvedValue(
        pendingEnrichment,
      );
      (enrichmentsRepo.save as jest.Mock).mockImplementation((e) =>
        Promise.resolve(e),
      );

      const pendingWfRun = {
        ...mockWorkflowRun,
        workflowName: 'lead-enrichment',
      };
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue(pendingWfRun);
      (workflowRunsRepo.save as jest.Mock).mockImplementation((w) =>
        Promise.resolve(w),
      );

      const result = await service.handleEnrichmentCallback({
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: EnrichmentStatus.FAILED,
        provider: 'clearbit',
        errorMessage: 'Domain not found or API rate limited',
      });

      expect(result.workflowRunUpdated).toBe(true);
      expect(result.enrichment.status).toBe(EnrichmentStatus.FAILED);
      expect(result.enrichment.errorMessage).toBe(
        'Domain not found or API rate limited',
      );
      expect(workflowRunsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: WorkflowStatus.FAILED,
          errorMessage: 'Domain not found or API rate limited',
        }),
      );
    });

    it('should create a fresh LeadEnrichment if no pending record was found', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({ ...mockLead });
      (enrichmentsRepo.findOne as jest.Mock).mockResolvedValue(null);
      (enrichmentsRepo.create as jest.Mock).mockReturnValue({
        ...mockEnrichment,
      });
      (enrichmentsRepo.save as jest.Mock).mockImplementation((e) =>
        Promise.resolve(e),
      );
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.handleEnrichmentCallback({
        leadId: 'lead-123',
        status: EnrichmentStatus.PARTIAL,
        provider: 'mock',
        companyName: 'Partially Enriched Co',
      });

      expect(enrichmentsRepo.create).toHaveBeenCalled();
      expect(result.enrichment.status).toBe(EnrichmentStatus.PARTIAL);
    });
  });

  describe('getEnrichmentsByLead & getLatestEnrichment', () => {
    it('should return all enrichments for a lead ordered by createdAt DESC', async () => {
      (enrichmentsRepo.find as jest.Mock).mockResolvedValue([mockEnrichment]);

      const list = await service.getEnrichmentsByLead('lead-123');
      expect(list).toEqual([mockEnrichment]);
      expect(enrichmentsRepo.find).toHaveBeenCalledWith({
        where: { leadId: 'lead-123' },
        order: { createdAt: 'DESC' },
        relations: { workflowRun: true },
      });
    });

    it('should return latest enrichment for a lead', async () => {
      (enrichmentsRepo.findOne as jest.Mock).mockResolvedValue(mockEnrichment);

      const latest = await service.getLatestEnrichment('lead-123');
      expect(latest).toEqual(mockEnrichment);
      expect(enrichmentsRepo.findOne).toHaveBeenCalledWith({
        where: { leadId: 'lead-123' },
        order: { createdAt: 'DESC' },
        relations: { workflowRun: true },
      });
    });
  });

  describe('mockEnrichment', () => {
    it('should return mock company and contact details given domain and email', () => {
      const res = service.mockEnrichment({
        domain: 'acme-corp.com',
        email: 'john@acme-corp.com',
        provider: 'mock',
      });

      expect(res.provider).toBe('mock');
      expect(res.company.name).toContain('Acme-corp');
      expect(res.company.website).toBe('https://acme-corp.com');
      expect(res.company.size).toBe(150);
      expect(res.contact.jobTitle).toBe('Director of Operations');
      expect(res.rawResponse).toBeDefined();
    });

    it('should throw InternalServerErrorException when fail="true" or domain is fail-retry.test', () => {
      expect(() =>
        service.mockEnrichment({
          fail: 'true',
        }),
      ).toThrow(InternalServerErrorException);

      expect(() =>
        service.mockEnrichment({
          domain: 'fail-retry.test',
        }),
      ).toThrow(InternalServerErrorException);
    });
  });
});
