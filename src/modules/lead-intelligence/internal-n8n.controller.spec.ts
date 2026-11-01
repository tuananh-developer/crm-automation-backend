import { InternalN8nController } from './internal-n8n.controller.js';
import type { LeadIntelligenceService } from './lead-intelligence.service.js';
import type { DataCleaningService } from '../data-cleaning/data-cleaning.service.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';
import {
  EnrichmentStatus,
  QualificationStatus,
  ScoreLabel,
} from './enums/lead-intelligence.enum.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import type { LeadQualification } from './entities/lead-qualification.entity.js';
import type { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import type { LeadScore } from './entities/lead-score.entity.js';

describe('InternalN8nController', () => {
  let controller: InternalN8nController;
  let leadIntelligenceService: jest.Mocked<Partial<LeadIntelligenceService>>;
  let dataCleaningService: jest.Mocked<Partial<DataCleaningService>>;

  const mockQualification: LeadQualification = {
    id: 'qual-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    status: QualificationStatus.QUALIFIED,
    intent: 'HIGH',
    confidence: 0.95,
    reason: 'Strong B2B fit',
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
    provider: 'clearbit',
    externalRequestId: null,
    status: EnrichmentStatus.SUCCESS,
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    companyIndustry: 'Technology',
    companySize: 250,
    contactJobTitle: 'VP Engineering',
    contactLinkedinUrl: 'https://linkedin.com/in/vp',
    rawResponse: {},
    errorMessage: null,
    enrichedAt: new Date(),
    createdAt: new Date(),
  };

  const mockScore: LeadScore = {
    id: 'score-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    score: 88,
    label: ScoreLabel.HOT,
    reason: 'High score',
    scoringFeatures: {},
    modelProvider: 'lead-scoring-engine',
    modelName: null,
    modelVersion: '1.0.0',
    inputSnapshot: {},
    outputSnapshot: {},
    createdAt: new Date(),
  };

  beforeEach(() => {
    leadIntelligenceService = {
      getLeadContextForN8n: jest.fn().mockResolvedValue({
        data: { id: 'lead-123' },
      }),
      getLeadInteractionContextForN8n: jest.fn().mockResolvedValue({
        items: [],
      }),
      ensureQualificationReviewerNotification: jest.fn().mockResolvedValue({
        eventId: 'event-123',
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        reviewTaskId: 'review-123',
        qualificationId: 'qual-123',
        idempotencyKey: 'wf-run-123',
        notificationFound: false,
        notification: null,
      }),
      handleQualificationCallback: jest.fn().mockResolvedValue({
        qualification: mockQualification,
        leadStatus: LeadStatus.QUALIFIED,
        reviewRequired: false,
      }),
      handleEnrichmentCallback: jest.fn().mockResolvedValue({
        enrichment: mockEnrichment,
        workflowRunUpdated: true,
      }),
      handleScoringCallback: jest.fn().mockResolvedValue({
        score: mockScore,
        workflowRunUpdated: true,
      }),
    };

    dataCleaningService = {
      handleCallback: jest.fn().mockResolvedValue({
        workflowRunId: 'wf-cleaning-1',
        findingsCount: 3,
        status: 'SUCCESS' as const,
      }),
    };

    controller = new InternalN8nController(
      leadIntelligenceService as LeadIntelligenceService,
      dataCleaningService as DataCleaningService,
    );
  });

  describe('Route and Guard Metadata', () => {
    it('should protect entire controller with N8nAuthGuard at class level', () => {
      const guards = Reflect.getMetadata('__guards__', InternalN8nController);
      expect(guards).toBeDefined();
      expect(guards).toContain(N8nAuthGuard);
    });

    it('should have path internal/n8n at controller level', () => {
      const path = Reflect.getMetadata('path', InternalN8nController);
      expect(path).toBe('internal/n8n');
    });
  });

  describe('WF01 context and reviewer notification routes', () => {
    it('delegates Lead context reads to the service', async () => {
      await controller.getLeadContextForN8n('lead-123', 'wf-run-123');
      expect(leadIntelligenceService.getLeadContextForN8n).toHaveBeenCalledWith(
        'lead-123',
        'wf-run-123',
      );
    });

    it('delegates interaction context reads to the service', async () => {
      await controller.getLeadInteractionContextForN8n(
        'lead-123',
        'wf-run-123',
        20,
      );
      expect(
        leadIntelligenceService.getLeadInteractionContextForN8n,
      ).toHaveBeenCalledWith('lead-123', 'wf-run-123', 20);
    });

    it('passes the idempotency header to the read-only notification receipt service', async () => {
      const dto = {
        eventId: 'event-123',
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        reviewTaskId: 'review-123',
        qualificationId: 'qual-123',
      };
      await controller.ensureQualificationReviewerNotification(
        dto,
        'wf-run-123',
      );
      expect(
        leadIntelligenceService.ensureQualificationReviewerNotification,
      ).toHaveBeenCalledWith(dto, 'wf-run-123');
    });
  });

  describe('handleQualificationCallback', () => {
    it('should delegate to leadIntelligenceService.handleQualificationCallback and map response', async () => {
      const dto = {
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: QualificationStatus.QUALIFIED,
        confidence: 0.95,
      };

      const result = await controller.handleQualificationCallback(dto);

      expect(
        leadIntelligenceService.handleQualificationCallback,
      ).toHaveBeenCalledWith(dto);
      expect(result.leadStatus).toBe(LeadStatus.QUALIFIED);
      expect(result.reviewRequired).toBe(false);
      expect(result.qualification.id).toBe('qual-123');
    });
  });

  describe('handleEnrichmentCallback', () => {
    it('should delegate to leadIntelligenceService.handleEnrichmentCallback and map response', async () => {
      const dto = {
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: EnrichmentStatus.SUCCESS,
        companyName: 'Acme Corp',
      };

      const result = await controller.handleEnrichmentCallback(dto);

      expect(
        leadIntelligenceService.handleEnrichmentCallback,
      ).toHaveBeenCalledWith(dto);
      expect(result.workflowRunUpdated).toBe(true);
      expect(result.enrichment.companyName).toBe('Acme Corp');
    });
  });

  describe('handleScoringCallback', () => {
    it('should delegate to leadIntelligenceService.handleScoringCallback and map response', async () => {
      const dto = {
        leadId: 'lead-123',
        workflowRunId: 'wf-run-123',
        status: 'SUCCESS' as const,
        score: 88,
        label: ScoreLabel.HOT,
        reason: 'High score',
      };

      const result = await controller.handleScoringCallback(dto);

      expect(
        leadIntelligenceService.handleScoringCallback,
      ).toHaveBeenCalledWith(dto);
      expect(result.workflowRunUpdated).toBe(true);
      expect(result.score?.score).toBe(88);
    });
  });

  describe('handleDataCleaningCallback', () => {
    it('should delegate to dataCleaningService.handleCallback', async () => {
      const dto = {
        workflowRunId: 'wf-cleaning-1',
        status: 'SUCCESS' as const,
        findings: [],
        summary: {
          totalLeadsScanned: 10,
          totalIssuesFound: 0,
          issuesByType: {},
          issuesBySeverity: {},
          duplicatesFound: 0,
          safeToApplyCount: 0,
        },
      };

      const result = await controller.handleDataCleaningCallback(dto);

      expect(dataCleaningService.handleCallback).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        workflowRunId: 'wf-cleaning-1',
        findingsCount: 3,
        status: 'SUCCESS',
      });
    });

    it('should throw Error if DataCleaningService is not injected', async () => {
      const standaloneController = new InternalN8nController(
        leadIntelligenceService as LeadIntelligenceService,
        undefined,
      );

      const dto = {
        workflowRunId: 'wf-cleaning-1',
        status: 'SUCCESS' as const,
        findings: [],
        summary: {
          totalLeadsScanned: 10,
          totalIssuesFound: 0,
          issuesByType: {},
          issuesBySeverity: {},
          duplicatesFound: 0,
          safeToApplyCount: 0,
        },
      };

      await expect(
        standaloneController.handleDataCleaningCallback(dto),
      ).rejects.toThrow('DataCleaningService is not available');
    });
  });
});
