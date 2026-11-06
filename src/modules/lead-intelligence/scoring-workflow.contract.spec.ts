import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import { ScoreLabel } from './enums/lead-intelligence.enum.js';
import { WorkflowStatus } from '../workflow/enums/workflow.enum.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationType } from '../notifications/enums/notification.enum.js';
import {
  CRM_EVENTS,
  CRM_EXCHANGE,
  LEAD_SCORING_QUEUE,
} from '../../infrastructure/rabbitmq/rabbitmq.constants.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import type { ScoringCallbackDto } from './dto/scoring-callback.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
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

/* eslint-disable @typescript-eslint/no-implied-eval */
describe('UC04 AI Lead Scoring Workflow Contract & Integration', () => {
  const workflowPath = path.resolve(
    process.cwd(),
    'integrations/n8n/workflows/uc04-ai-lead-scoring.json',
  );

  describe('n8n Workflow Structure, Queue Binding & Security Contract', () => {
    it('standardizes workflow to exactly 12 functional nodes', () => {
      expect(fs.existsSync(workflowPath)).toBe(true);
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      expect(wf.nodes).toHaveLength(12);
    });

    it('configures RabbitMQ trigger queue to match backend publisher constant LEAD_SCORING_QUEUE', () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const trigger = wf.nodes.find(
        (n: { name: string }) => n.name === 'RabbitMQ Trigger',
      );
      expect(trigger).toBeDefined();
      expect(trigger.parameters.queue).toBe(LEAD_SCORING_QUEUE);
      expect(LEAD_SCORING_QUEUE).toBe('n8n.lead-scoring.q');
      expect(CRM_EXCHANGE).toBe('crm.events');
      expect(CRM_EVENTS.LEAD_SCORING_REQUESTED).toBe('lead.scoring.requested');
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

  describe('n8n Runtime Execution: Aggregate Features & Degraded Read Policy', () => {
    const runAggregateFeaturesNode = (nodesMap: Record<string, unknown>) => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const aggNode = wf.nodes.find(
        (n: { name: string }) => n.name === 'Code: Aggregate Features',
      );
      const fn = new Function('$', aggNode.parameters.jsCode as string) as (
        $: (name: string) => { first: () => { json: unknown } },
      ) => Array<{ json: Record<string, any> }>;

      return fn((nodeName: string) => ({
        first: () => ({ json: nodesMap[nodeName] }),
      }));
    };

    it('forwards raw context without n8n-computed scoringFeatures points on healthy reads', () => {
      const out = runAggregateFeaturesNode({
        'Code: Validate Event': {
          leadId: 'lead-100',
          workflowRunId: 'run-100',
          eventData: {},
        },
        'HTTP Request: Get Lead': {
          id: 'lead-100',
          email: 'ceo@acme.io',
          companyName: 'Acme Corp',
          companySize: 200,
          jobTitle: 'CEO',
        },
        'HTTP Request: Get Latest Qualification': {
          id: 'qual-100',
          status: 'QUALIFIED',
          confidence: 0.9,
        },
        'HTTP Request: Get Latest Enrichment': {
          id: 'enrich-100',
          status: 'SUCCESS',
          companySize: 250,
        },
        'HTTP Request: Get Interactions': {
          interactions: [{ id: 'int-1', type: 'MEETING' }],
        },
      });

      expect(out[0].json.leadId).toBe('lead-100');
      expect(out[0].json.workflowRunId).toBe('run-100');
      expect(out[0].json.scoringFeatures).toBeUndefined();
      expect(out[0].json.contextAudit).toEqual({
        degradedRead: false,
        sources: {
          lead: 'backend_http',
          qualification: 'backend_http',
          enrichment: 'backend_http',
          interactions: 'backend_http',
        },
        readErrors: [],
      });
    });

    it('fails immediately on 401/403 authentication error in any internal read node', () => {
      expect(() =>
        runAggregateFeaturesNode({
          'Code: Validate Event': {
            leadId: 'lead-100',
            workflowRunId: 'run-100',
            eventData: {
              leadData: { id: 'lead-100', email: 'ceo@acme.io' },
              interactions: [],
            },
          },
          'HTTP Request: Get Lead': {
            statusCode: 401,
            message: 'Invalid N8N API key',
          },
          'HTTP Request: Get Latest Qualification': {},
          'HTTP Request: Get Latest Enrichment': {},
          'HTTP Request: Get Interactions': { interactions: [] },
        }),
      ).toThrow(/Fatal authentication\/authorization error \(401\)/);
    });

    it('fails immediately when Get Lead returns 404 Not Found', () => {
      expect(() =>
        runAggregateFeaturesNode({
          'Code: Validate Event': {
            leadId: 'lead-missing',
            workflowRunId: 'run-100',
            eventData: {
              leadData: { id: 'lead-missing', email: 'ghost@acme.io' },
              interactions: [],
            },
          },
          'HTTP Request: Get Lead': {
            statusCode: 404,
            message: 'Lead not found',
          },
          'HTTP Request: Get Latest Qualification': {},
          'HTTP Request: Get Latest Enrichment': {},
          'HTTP Request: Get Interactions': { interactions: [] },
        }),
      ).toThrow(/Lead not found \(404\)/);
    });

    it('fails when transient 500 occurs on Get Lead and event payload has no valid leadData snapshot', () => {
      expect(() =>
        runAggregateFeaturesNode({
          'Code: Validate Event': {
            leadId: 'lead-100',
            workflowRunId: 'run-100',
            eventData: {},
          },
          'HTTP Request: Get Lead': {
            statusCode: 503,
            message: 'Service unavailable',
          },
          'HTTP Request: Get Latest Qualification': {},
          'HTTP Request: Get Latest Enrichment': {},
          'HTTP Request: Get Interactions': { interactions: [] },
        }),
      ).toThrow(/no valid leadData snapshot is available/);
    });

    it('uses validated event snapshot fallback and records contextAudit on transient 503 read failure', () => {
      const out = runAggregateFeaturesNode({
        'Code: Validate Event': {
          leadId: 'lead-100',
          workflowRunId: 'run-100',
          eventData: {
            leadData: {
              id: 'lead-100',
              email: 'founder@acme.io',
              companyName: 'Acme Corp',
              jobTitle: 'Founder',
            },
            qualificationData: {
              status: 'QUALIFIED',
              confidence: 0.88,
            },
            enrichmentData: null,
            interactions: [{ id: 'int-1', type: 'CALL' }],
          },
        },
        'HTTP Request: Get Lead': {
          statusCode: 503,
          message: 'Upstream timeout',
        },
        'HTTP Request: Get Latest Qualification': {
          status: 'QUALIFIED',
          confidence: 0.88,
        },
        'HTTP Request: Get Latest Enrichment': {},
        'HTTP Request: Get Interactions': {
          statusCode: 502,
          message: 'Bad gateway',
        },
      });

      expect(out[0].json.lead.email).toBe('founder@acme.io');
      expect(out[0].json.interactions).toHaveLength(1);
      expect(out[0].json.contextAudit.degradedRead).toBe(true);
      expect(out[0].json.contextAudit.sources).toEqual({
        lead: 'event_fallback',
        qualification: 'backend_http',
        enrichment: 'backend_http',
        interactions: 'event_fallback',
      });
      expect(out[0].json.contextAudit.readErrors).toHaveLength(2);
    });
  });

  describe('Backend Authority: Policy Evaluation across 3 Score Bands & Title Classification', () => {
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

    it('evaluates HOT band (score >= 75) from raw context with canonical breakdown and version 1.0', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-1',
        workflowRunId: 'run-1',
        lead: {
          companyName: 'Enterprise Inc',
          companySize: 200,
          jobTitle: 'Chief Executive Officer',
        },
        qual: {
          status: 'QUALIFIED',
          confidence: 0.8,
        },
        enrich: {
          status: 'SUCCESS',
          companySize: 200,
        },
        interactions: [{ id: 'i1' }, { id: 'i2' }],
      });

      // base(20) + profileFit(20) + decisionMaker(20) + qual(20) + engagement(16) + enrich(10) = 100
      expect(result.score).toBe(100);
      expect(result.label).toBe(ScoreLabel.HOT);
      expect(result.policyVersion).toBe('1.0');
      expect(result.reason).toContain('HOT');
      expect(result.breakdown?.baseScore).toBe(20);
      expect(result.modelInfo?.provider).toBe('crm-scoring-policy');
      expect(result.modelInfo?.modelVersion).toBe('1.0');
    });

    it('evaluates WARM band (40 <= score < 75) from raw context with canonical breakdown', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-2',
        workflowRunId: 'run-2',
        lead: {
          companyName: 'MidMarket Co',
          companySize: 12,
          jobTitle: 'Software Engineer',
        },
        qual: {
          status: 'NEEDS_REVIEW',
        },
        interactions: [{ id: 'i1' }],
      });

      // base(20) + profileFit(10) + non-DM title(10) + qual(10) + engagement(8) + enrich(0) = 58
      expect(result.score).toBe(58);
      expect(result.label).toBe(ScoreLabel.WARM);
      expect(result.policyVersion).toBe('1.0');
      expect(result.reason).toContain('WARM');
    });

    it('evaluates COLD band (score < 40) from raw context with canonical breakdown', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-3',
        workflowRunId: 'run-3',
        lead: {
          companySize: 2,
        },
        qual: {
          status: 'DISQUALIFIED',
        },
        interactions: [],
      });

      // base(20) + profileFit(5) + decisionMaker(0) + qual(-20) + engagement(0) + enrich(0) = 5
      expect(result.score).toBe(5);
      expect(result.label).toBe(ScoreLabel.COLD);
      expect(result.policyVersion).toBe('1.0');
      expect(result.reason).toContain('COLD');
    });

    it('ignores caller-supplied scoringFeatures point overrides and derives score strictly from raw context', async () => {
      const result = await service.evaluateScoringPolicy({
        leadId: 'lead-tampered',
        workflowRunId: 'run-tampered',
        lead: {
          companySize: 2,
        },
        qual: {
          status: 'DISQUALIFIED',
        },
        interactions: [],
        scoringFeatures: {
          baseScore: 50,
          profileFitPoints: 80,
          decisionMakerPoints: 40,
          qualificationPoints: 25,
          engagementPoints: 25,
          enrichmentBonus: 10,
        },
      });

      expect(result.score).toBe(5);
      expect(result.label).toBe(ScoreLabel.COLD);
      expect(result.breakdown?.profileFitPoints).toBe(5);
      expect(result.breakdown?.decisionMakerPoints).toBe(0);
      expect(result.breakdown?.qualificationPoints).toBe(-20);
    });

    it('does not treat individual-contributor or team-lead titles containing "lead" as executive decision makers', async () => {
      const nonDecisionLeadTitles = [
        'Team Lead',
        'Lead Developer',
        'Tech Lead',
        'QA Lead',
        'Support Lead',
      ];

      for (const title of nonDecisionLeadTitles) {
        const res = await service.evaluateScoringPolicy({
          leadId: 'lead-title-check',
          workflowRunId: 'run-title-check',
          lead: {
            jobTitle: title,
          },
        });
        expect(res.breakdown?.decisionMakerPoints).toBe(10);
        expect(res.scoringFeatures?.isDecisionMaker).toBe(false);
      }

      const executiveTitles = [
        'Chief Technology Officer',
        'VP of Engineering',
        'Vice President of Sales',
        'Director of Product',
        'Head of Growth',
        'Co-Founder',
        'Managing Partner',
      ];

      for (const title of executiveTitles) {
        const res = await service.evaluateScoringPolicy({
          leadId: 'lead-exec-check',
          workflowRunId: 'run-exec-check',
          lead: {
            jobTitle: title,
          },
        });
        expect(res.breakdown?.decisionMakerPoints).toBe(20);
        expect(res.scoringFeatures?.isDecisionMaker).toBe(true);
      }
    });
  });

  describe('Trigger Authorization, Ownership & Correlation Callback Handling', () => {
    let service: LeadIntelligenceService;
    let leadsRepo: jest.Mocked<Partial<Repository<Lead>>>;
    let workflowRunsRepo: jest.Mocked<Partial<Repository<WorkflowRun>>>;
    let scoresRepo: jest.Mocked<Partial<Repository<LeadScore>>>;
    let qualificationsRepo: jest.Mocked<Partial<Repository<LeadQualification>>>;
    let enrichmentsRepo: jest.Mocked<Partial<Repository<LeadEnrichment>>>;
    let interactionsRepo: jest.Mocked<Partial<Repository<Interaction>>>;
    let rabbitmqService: jest.Mocked<Partial<RabbitMQService>>;

    const ownerActor: AuthenticatedUser = {
      id: 'owner-user-1',
      name: 'Owner Sales',
      email: 'owner@example.com',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const otherSalesActor: AuthenticatedUser = {
      id: 'other-user-2',
      name: 'Other Sales',
      email: 'other@example.com',
      role: UserRole.SALES,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      leadsRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'lead-1',
          ownerId: 'owner-user-1',
          email: 'prospect@acme.io',
        }),
      };
      workflowRunsRepo = {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((val: unknown) => ({
          id: 'run-created-1',
          ...(val as object),
        })),
        save: jest
          .fn()
          .mockImplementation((val: unknown) => Promise.resolve(val)),
      };
      scoresRepo = {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((val: unknown) => ({
          id: 'score-1',
          ...(val as object),
        })),
        save: jest
          .fn()
          .mockImplementation((val: unknown) => Promise.resolve(val)),
      };
      qualificationsRepo = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      enrichmentsRepo = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      interactionsRepo = {
        find: jest.fn().mockResolvedValue([]),
      };
      rabbitmqService = {
        publishLeadScoringRequested: jest.fn().mockResolvedValue(true),
      };

      service = new LeadIntelligenceService(
        qualificationsRepo as Repository<LeadQualification>,
        leadsRepo as Repository<Lead>,
        workflowRunsRepo as Repository<WorkflowRun>,
        undefined as unknown as Repository<ReviewTask>,
        undefined as unknown as Repository<Notification>,
        rabbitmqService as RabbitMQService,
        scoresRepo as Repository<LeadScore>,
        interactionsRepo as Repository<Interaction>,
        enrichmentsRepo as Repository<LeadEnrichment>,
      );
    });

    it('rejects triggerScoring when non-Admin user does not own the lead', async () => {
      await expect(
        service.triggerScoring(
          'lead-1',
          { userId: 'spoofed-user' },
          otherSalesActor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('attributes triggeredByUserId to authenticated actor and ignores caller-supplied dto.userId', async () => {
      await service.triggerScoring(
        'lead-1',
        { userId: 'spoofed-admin-id' },
        ownerActor,
      );

      expect(workflowRunsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-1',
          triggeredByUserId: 'owner-user-1',
        }),
      );
    });

    it('preserves policyVersion 1.0 in LeadScore.modelVersion from Validate Canonical Score node through callback', async () => {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const validateScoreNode = wf.nodes.find(
        (n: { name: string }) => n.name === 'Code: Validate Canonical Score',
      );

      const policyResponse = await service.evaluateScoringPolicy({
        leadId: 'lead-1',
        workflowRunId: 'run-1',
        lead: {
          companyName: 'Acme Corp',
          companySize: 200,
          jobTitle: 'CEO',
        },
        qual: {
          status: 'QUALIFIED',
          confidence: 0.9,
        },
        enrich: {
          status: 'SUCCESS',
        },
        interactions: [{ id: 'int-1' }, { id: 'int-2' }],
      });

      const runValidateScore = new Function(
        '$input',
        '$',
        validateScoreNode.parameters.jsCode as string,
      ) as (
        $input: { first: () => { json: unknown } },
        $: (name: string) => { first: () => { json: unknown } },
      ) => Array<{ json: Record<string, any> }>;

      const callbackPayloads = runValidateScore(
        { first: () => ({ json: policyResponse }) },
        () => ({
          first: () => ({
            json: {
              leadId: 'lead-1',
              workflowRunId: 'run-1',
              contextAudit: { degradedRead: false },
            },
          }),
        }),
      );

      const callbackDto = callbackPayloads[0].json;
      expect(callbackDto.modelVersion).toBe('1.0');
      expect(callbackDto.modelInfo.version).toBe('1.0');

      (workflowRunsRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'run-1',
        leadId: 'lead-1',
        workflowName: 'lead-scoring',
        status: WorkflowStatus.PENDING,
      });
      (scoresRepo.findOne as jest.Mock).mockResolvedValue(null);

      const saved = await service.handleScoringCallback(
        callbackDto as unknown as ScoringCallbackDto,
      );
      expect(saved.score?.modelVersion).toBe('1.0');
      expect(saved.score?.modelProvider).toBe('crm-scoring-policy');
      expect(saved.score?.modelName).toBe('deterministic-scoring-v1');
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
      ).rejects.toBeInstanceOf(NotFoundException);
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
      ).rejects.toBeInstanceOf(NotFoundException);
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
        label: ScoreLabel.COLD,
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

  describe('HOT Lead Branch Notification & Severity Persistence', () => {
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

    it('creates notification, persists severity HIGH, and resolves recipient from lead ownerId when userId is omitted', async () => {
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
      expect(notification.severity).toBe('HIGH');
      expect(notification.leadId).toBe('lead-hot-1');
      expect(notificationsRepo.save).toHaveBeenCalled();
    });

    it('defaults notification severity to INFO when omitted', async () => {
      const notification = await notificationsService.create({
        userId: 'owner-uuid-123',
        type: NotificationType.WORKFLOW_COMPLETED,
        title: 'Lead Scored',
      });

      expect(notification.severity).toBe('INFO');
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
/* eslint-enable @typescript-eslint/no-implied-eval */
