import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import { ScoreLabel } from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import type { Repository } from 'typeorm';
import type { Lead } from '../leads/entities/lead.entity.js';
import type { LeadQualification } from './entities/lead-qualification.entity.js';
import type { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import type { LeadScore } from './entities/lead-score.entity.js';
import type { Interaction } from '../leads/entities/interaction.entity.js';
import type { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import type { ReviewTask } from '../review/entities/review-task.entity.js';
import type { Notification } from '../notifications/entities/notification.entity.js';
import type { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service.js';

describe('UC04 AI Lead Scoring Workflow Contract & Integration', () => {
  const workflowPath = path.resolve(
    __dirname,
    '../../../integrations/n8n/workflows/uc04-ai-lead-scoring.json',
  );

  describe('n8n Workflow Structure & Security Contract', () => {
    it('standardizes workflow to exactly 12 functional nodes', () => {
      expect(fs.existsSync(workflowPath)).toBe(true);
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      expect(wf.nodes).toHaveLength(12);
    });

    it('configures RabbitMQ trigger with approved contract queue', () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const trigger = wf.nodes.find(
        (n: { name: string }) => n.name === 'RabbitMQ Trigger',
      );
      expect(trigger).toBeDefined();
      expect(trigger.parameters.queue).toBe('n8n.lead-scoring.q');
    });

    it('requires both leadId and workflowRunId in validation node', () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const validateNode = wf.nodes.find(
        (n: { name: string }) => n.name === 'Code: Validate Event',
      );
      expect(validateNode).toBeDefined();
      expect(validateNode.parameters.jsCode).toContain('Missing leadId');
      expect(validateNode.parameters.jsCode).toContain('Missing workflowRunId');
    });

    it('routes internal read nodes through authenticated /internal endpoints with X-N8N-API-KEY', () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const internalNodes = [
        { name: 'HTTP Request: Get Lead', expectedPath: '/api/v1/leads/' },
        {
          name: 'HTTP Request: Get Latest Qualification',
          expectedPath: '/api/v1/lead-intelligence/qualifications/',
        },
        {
          name: 'HTTP Request: Get Latest Enrichment',
          expectedPath: '/api/v1/enrichment/lead/',
        },
        {
          name: 'HTTP Request: Get Interactions',
          expectedPath: '/api/v1/scoring/context/',
        },
      ];

      for (const item of internalNodes) {
        const node = wf.nodes.find(
          (n: { name: string }) => n.name === item.name,
        );
        expect(node).toBeDefined();
        expect(node.parameters.url).toContain(item.expectedPath);
        expect(node.parameters.url).toContain('/internal');

        const headers = node.parameters.headerParameters?.parameters ?? [];
        const apiKeyHeader = headers.find(
          (h: { name: string }) => h.name === 'X-N8N-API-KEY',
        );
        expect(apiKeyHeader).toBeDefined();
        expect(apiKeyHeader.value).toBe('={{ $env.N8N_API_KEY }}');
      }
    });

    it('delegates scoring policy to authoritative backend endpoint instead of direct Gemini LLM call', () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const policyNode = wf.nodes.find(
        (n: { name: string }) =>
          n.name === 'HTTP Request: Evaluate Backend Scoring Policy',
      );
      expect(policyNode).toBeDefined();
      expect(policyNode.parameters.url).toContain(
        '/api/v1/scoring/evaluate-policy',
      );
      expect(policyNode.parameters.url).not.toContain('generativelanguage');
      expect(policyNode.parameters.url).not.toContain('key=');

      const headers = policyNode.parameters.headerParameters?.parameters ?? [];
      const apiKeyHeader = headers.find(
        (h: { name: string }) => h.name === 'X-N8N-API-KEY',
      );
      expect(apiKeyHeader).toBeDefined();
      expect(apiKeyHeader.value).toBe('={{ $env.N8N_API_KEY }}');
    });

    it('enforces retry options and halts on non-2xx failure for scoring callback node', () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const callbackNode = wf.nodes.find(
        (n: { name: string }) => n.name === 'HTTP Request: Scoring Callback',
      );
      expect(callbackNode).toBeDefined();
      expect(callbackNode.parameters.url).toContain(
        '/api/v1/internal/n8n/lead-scoring/callback',
      );
      expect(callbackNode.onError).toBeUndefined();
      expect(callbackNode.parameters.options?.retry?.maxTries).toBe(3);
    });

    it('routes hot-lead branch to canonical internal notifications endpoint', () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const notifyNode = wf.nodes.find(
        (n: { name: string }) =>
          n.name === 'HTTP Request: Backend Next-Action/Notification',
      );
      expect(notifyNode).toBeDefined();
      expect(notifyNode.parameters.url).toContain(
        '/api/v1/notifications/internal/create',
      );
      expect(notifyNode.onError).toBeUndefined();

      const headers = notifyNode.parameters.headerParameters?.parameters ?? [];
      const apiKeyHeader = headers.find(
        (h: { name: string }) => h.name === 'X-N8N-API-KEY',
      );
      expect(apiKeyHeader).toBeDefined();
      expect(apiKeyHeader.value).toBe('={{ $env.N8N_API_KEY }}');
    });
  });

  describe('Backend Authority: Policy Evaluation across 3 Score Bands', () => {
    let service: LeadIntelligenceService;

    beforeEach(() => {
      service = new LeadIntelligenceService(
        undefined as unknown as Repository<LeadQualification>,
        undefined as unknown as Repository<Lead>,
        undefined as unknown as Repository<WorkflowRun>,
        undefined as unknown as Repository<ReviewTask>,
        undefined as unknown as Repository<Notification>,
        undefined as unknown as RabbitMQService,
        undefined as unknown as Repository<LeadScore>,
        undefined as unknown as Repository<Interaction>,
        undefined as unknown as Repository<LeadEnrichment>,
      );
    });

    it('evaluates HOT band (score >= 75) with canonical breakdown and version 1.0', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-1',
        workflowRunId: 'run-1',
        scoringFeatures: {
          baseScore: 20,
          profileFitPoints: 20,
          decisionMakerPoints: 20,
          qualificationPoints: 20,
          engagementPoints: 10,
          enrichmentBonus: 10,
        },
      });

      expect(result.score).toBe(100);
      expect(result.label).toBe(ScoreLabel.HOT);
      expect(result.policyVersion).toBe('1.0');
      expect(result.reason).toContain('HOT');
      expect(result.breakdown?.baseScore).toBe(20);
      expect(result.modelInfo?.provider).toBe('crm-scoring-policy');
    });

    it('evaluates WARM band (40 <= score < 75) with canonical breakdown', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-2',
        workflowRunId: 'run-2',
        scoringFeatures: {
          baseScore: 20,
          profileFitPoints: 10,
          decisionMakerPoints: 10,
          qualificationPoints: 10,
          engagementPoints: 5,
          enrichmentBonus: 0,
        },
      });

      expect(result.score).toBe(55);
      expect(result.label).toBe(ScoreLabel.WARM);
      expect(result.policyVersion).toBe('1.0');
      expect(result.reason).toContain('WARM');
    });

    it('evaluates COLD band (score < 40) with canonical breakdown', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-3',
        workflowRunId: 'run-3',
        scoringFeatures: {
          baseScore: 20,
          profileFitPoints: 5,
          decisionMakerPoints: 0,
          qualificationPoints: -20,
          engagementPoints: 0,
          enrichmentBonus: 0,
        },
      });

      expect(result.score).toBe(5);
      expect(result.label).toBe(ScoreLabel.COLD);
      expect(result.policyVersion).toBe('1.0');
      expect(result.reason).toContain('COLD');
    });

    it('clamps scores within valid 0 to 100 boundaries', async () => {
      const negativeResult = await service.evaluateScoringPolicy({
        leadId: 'lead-neg',
        workflowRunId: 'run-neg',
        scoringFeatures: {
          baseScore: 10,
          qualificationPoints: -50,
        },
      });
      expect(negativeResult.score).toBe(0);
      expect(negativeResult.label).toBe(ScoreLabel.COLD);

      const excessiveResult = await service.evaluateScoringPolicy({
        leadId: 'lead-over',
        workflowRunId: 'run-over',
        scoringFeatures: {
          baseScore: 50,
          profileFitPoints: 40,
          decisionMakerPoints: 30,
          qualificationPoints: 25,
        },
      });
      expect(excessiveResult.score).toBe(100);
      expect(excessiveResult.label).toBe(ScoreLabel.HOT);
    });

    it('calculates deterministic score from raw context when feature points are omitted', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-raw',
        workflowRunId: 'run-raw',
        lead: {
          companyName: 'Acme Corp',
          companySize: 150,
          jobTitle: 'Chief Technology Officer',
        },
        qual: {
          status: 'QUALIFIED',
          confidence: 0.9,
        },
        enrich: {
          status: 'SUCCESS',
        },
        interactions: [
          { type: 'EMAIL' },
          { type: 'CALL' },
          { type: 'MEETING' },
        ],
      });

      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.label).toBe(ScoreLabel.HOT);
      expect(result.policyVersion).toBe('1.0');
      expect(result.breakdown?.decisionMakerPoints).toBe(20);
      expect(result.breakdown?.profileFitPoints).toBe(20);
      expect(result.breakdown?.enrichmentBonus).toBe(10);
    });
  });

  describe('Correlation, Idempotency & Failure Callback Handling', () => {
    let service: LeadIntelligenceService;
    let leadsRepo: jest.Mocked<Partial<Repository<Lead>>>;
    let workflowRunsRepo: jest.Mocked<Partial<Repository<WorkflowRun>>>;
    let scoresRepo: jest.Mocked<Partial<Repository<LeadScore>>>;

    beforeEach(() => {
      leadsRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'lead-1' }),
      };
      workflowRunsRepo = {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((val: unknown) => val),
        save: jest
          .fn()
          .mockImplementation((val: unknown) => Promise.resolve(val)),
      };
      scoresRepo = {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((val: unknown) => ({
          id: 'score-1',
          ...(val as object),
        })),
        save: jest
          .fn()
          .mockImplementation((val: unknown) => Promise.resolve(val)),
      };

      service = new LeadIntelligenceService(
        undefined as unknown as Repository<LeadQualification>,
        leadsRepo as Repository<Lead>,
        workflowRunsRepo as Repository<WorkflowRun>,
        undefined as unknown as Repository<ReviewTask>,
        undefined as unknown as Repository<Notification>,
        undefined as unknown as RabbitMQService,
        scoresRepo as Repository<LeadScore>,
        undefined as unknown as Repository<Interaction>,
        undefined as unknown as Repository<LeadEnrichment>,
      );
    });

    it('rejects callback when workflowRunId is unknown', async () => {
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.handleScoringCallback({
          leadId: 'lead-1',
          workflowRunId: 'unknown-run',
          score: 80,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects callback when workflowRunId belongs to another lead', async () => {
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'run-other',
        leadId: 'lead-2',
        workflowName: 'lead-scoring',
      });

      await expect(
        service.handleScoringCallback({
          leadId: 'lead-1',
          workflowRunId: 'run-other',
          score: 80,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects callback when workflowRunId belongs to another workflow type', async () => {
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'run-diff-wf',
        leadId: 'lead-1',
        workflowName: 'lead-qualification',
      });

      await expect(
        service.handleScoringCallback({
          leadId: 'lead-1',
          workflowRunId: 'run-diff-wf',
          score: 80,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('handles idempotent duplicate callbacks safely without re-inserting score', async () => {
      const existingScore = {
        id: 'score-1',
        score: 85,
        label: ScoreLabel.HOT,
      } as LeadScore;
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        leadId: 'lead-1',
        workflowName: 'lead-scoring',
        status: WorkflowStatus.SUCCESS,
      });
      (scoresRepo.findOne as jest.Mock).mockResolvedValue(existingScore);

      const result = await service.handleScoringCallback({
        leadId: 'lead-1',
        workflowRunId: 'run-1',
        score: 85,
      });

      expect(result.score).toBe(existingScore);
      expect(result.workflowRunUpdated).toBe(false);
      expect(scoresRepo.save).not.toHaveBeenCalled();
    });

    it('enforces backend threshold labeling over conflicting callback label', async () => {
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        leadId: 'lead-1',
        workflowName: 'lead-scoring',
        status: WorkflowStatus.PENDING,
      });
      (scoresRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.handleScoringCallback({
        leadId: 'lead-1',
        workflowRunId: 'run-1',
        score: 85,
        label: ScoreLabel.COLD, // Conflicting label
      });

      expect(result.score?.label).toBe(ScoreLabel.HOT);
    });

    it('handles failure callback properly by updating run status without persisting score', async () => {
      const pendingRun = {
        id: 'run-fail',
        leadId: 'lead-1',
        workflowName: 'lead-scoring',
        status: WorkflowStatus.PENDING,
      };
      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue(pendingRun);
      (scoresRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.handleScoringCallback({
        leadId: 'lead-1',
        workflowRunId: 'run-fail',
        status: 'FAILED',
        errorMessage: 'Provider timed out',
      });

      expect(result.score).toBeNull();
      expect(result.workflowRunUpdated).toBe(true);
      expect(pendingRun.status).toBe(WorkflowStatus.FAILED);
      expect(scoresRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('HOT Lead Branch Notification Integration', () => {
    let notificationsService: NotificationsService;
    let notificationsRepo: jest.Mocked<Partial<Repository<Notification>>>;
    let leadsRepo: jest.Mocked<Partial<Repository<Lead>>>;

    beforeEach(() => {
      notificationsRepo = {
        create: jest.fn().mockImplementation((val: unknown) => val),
        save: jest
          .fn()
          .mockImplementation((val: unknown) => Promise.resolve(val)),
      };
      leadsRepo = {
        findOne: jest.fn(),
      };

      notificationsService = new NotificationsService(
        notificationsRepo as Repository<Notification>,
        undefined,
        leadsRepo as unknown as Repository<Lead>,
      );
    });

    it('creates notification and resolves recipient from lead ownerId when userId is omitted', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'lead-hot-1',
        ownerId: 'owner-uuid-123',
      });

      const notification = await notificationsService.create({
        type: NotificationType.WORKFLOW_COMPLETED,
        title: '🔥 Hot Lead Opportunity',
        message: 'Lead scored 85 (HOT). Immediate sales outreach recommended.',
        severity: 'HIGH',
        leadId: 'lead-hot-1',
      });

      expect(notification.userId).toBe('owner-uuid-123');
      expect(notification.type).toBe(NotificationType.WORKFLOW_COMPLETED);
      expect(notification.leadId).toBe('lead-hot-1');
      expect(notificationsRepo.save).toHaveBeenCalled();
    });

    it('fails closed when userId is omitted and lead has no owner', async () => {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'lead-unowned',
        ownerId: null,
      });

      await expect(
        notificationsService.create({
          type: NotificationType.WORKFLOW_COMPLETED,
          title: '🔥 Hot Lead Opportunity',
          leadId: 'lead-unowned',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
