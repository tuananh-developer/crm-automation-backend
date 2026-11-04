import { ScoringController } from './scoring.controller.js';
import type { LeadIntelligenceService } from './lead-intelligence.service.js';
import { ScoreLabel } from './enums/lead-intelligence.enum.js';
import type { LeadScore } from './entities/lead-score.entity.js';
import type { ScoringCallbackDto } from './dto/scoring-callback.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';

describe('ScoringController', () => {
  let controller: ScoringController;
  let service: jest.Mocked<Partial<LeadIntelligenceService>>;

  const mockScore: LeadScore = {
    id: 'score-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    score: 85,
    label: ScoreLabel.HOT,
    reason: 'High buying intent and strong company fit',
    scoringFeatures: { intent: 90, fit: 80 },
    modelProvider: 'openai',
    modelName: 'gpt-4o',
    modelVersion: '2024-08-06',
    inputSnapshot: {},
    outputSnapshot: {},
    createdAt: new Date(),
  };

  const mockActor: AuthenticatedUser = {
    id: 'user-123',
    name: 'Sales User',
    email: 'sales@example.com',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    service = {
      triggerScoring: jest.fn().mockResolvedValue({
        message: 'Lead scoring workflow triggered successfully',
        workflowRunId: 'wf-run-123',
        leadId: 'lead-123',
      }),
      evaluateScoringPolicy: jest.fn().mockResolvedValue({
        score: 85,
        label: ScoreLabel.HOT,
        policyVersion: '1.0',
        reason: 'Canonical HOT score',
        breakdown: { baseScore: 20 },
        scoringFeatures: {},
        modelInfo: {
          provider: 'crm-scoring-policy',
          model: 'deterministic-scoring-v1',
          modelVersion: '1.0',
        },
      }),
      handleScoringCallback: jest.fn().mockResolvedValue({
        score: mockScore,
        workflowRunUpdated: true,
      }),
      getScoringContext: jest.fn().mockResolvedValue({
        lead: { id: 'lead-123', email: 'john@example.com' },
        qualification: null,
        enrichment: null,
        interactions: [],
        scoringFeatures: {},
      }),
      getScoresByLead: jest.fn().mockResolvedValue([mockScore]),
      getLatestScore: jest.fn().mockResolvedValue(mockScore),
    };

    controller = new ScoringController(service as LeadIntelligenceService);
  });

  it('should trigger scoring via service', async () => {
    const result = await controller.triggerScoring('lead-123');

    expect(service.triggerScoring).toHaveBeenCalledWith(
      'lead-123',
      undefined,
      undefined,
    );
    expect(result.workflowRunId).toBe('wf-run-123');
  });

  it('should pass authenticated actor when triggering scoring', async () => {
    const dto = { userId: 'client-user' };
    await controller.triggerScoring('lead-123', dto, mockActor);

    expect(service.triggerScoring).toHaveBeenCalledWith(
      'lead-123',
      dto,
      mockActor,
    );
  });

  it('should evaluate scoring policy via service', async () => {
    const dto = {
      leadId: 'lead-123',
      workflowRunId: 'wf-run-123',
      scoringFeatures: { baseScore: 20 },
    };
    const result = await controller.evaluatePolicy(dto);

    expect(service.evaluateScoringPolicy).toHaveBeenCalledWith(dto);
    expect(result.score).toBe(85);
    expect(result.label).toBe(ScoreLabel.HOT);
    expect(result.policyVersion).toBe('1.0');
  });

  it('should handle scoring callback via service', async () => {
    const dto: ScoringCallbackDto = {
      leadId: 'lead-123',
      workflowRunId: 'wf-run-123',
      status: 'SUCCESS',
      score: 85,
      label: ScoreLabel.HOT,
      reason: 'High intent',
    };

    const result = await controller.handleCallback(dto);

    expect(service.handleScoringCallback).toHaveBeenCalledWith(dto);
    expect(result.workflowRunUpdated).toBe(true);
    expect(result.score?.score).toBe(85);
  });

  it('should return scoring context', async () => {
    const result = await controller.getScoringContext('lead-123');

    expect(service.getScoringContext).toHaveBeenCalledWith('lead-123');
    expect(result.lead.id).toBe('lead-123');
  });

  it('should return internal scoring context for n8n', async () => {
    const result = await controller.getScoringContextInternal('lead-123');

    expect(service.getScoringContext).toHaveBeenCalledWith('lead-123');
    expect(result.lead.id).toBe('lead-123');
  });

  it('should return score history', async () => {
    const result = await controller.getScores('lead-123');

    expect(service.getScoresByLead).toHaveBeenCalledWith('lead-123');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('score-123');
  });

  it('should return latest score', async () => {
    const result = await controller.getLatestScore('lead-123');

    expect(service.getLatestScore).toHaveBeenCalledWith('lead-123');
    expect(result?.label).toBe(ScoreLabel.HOT);
  });

  describe('Route Metadata', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    it('should configure canonical callback route paths on handleCallback', () => {
      const path = Reflect.getMetadata(
        'path',
        ScoringController.prototype.handleCallback,
      );
      expect(path).toEqual([
        'scoring/callback',
        'callback',
        '/internal/n8n/lead-scoring/callback',
      ]);
    });

    it('should configure evaluate-policy route paths on evaluatePolicy', () => {
      const path = Reflect.getMetadata(
        'path',
        ScoringController.prototype.evaluatePolicy,
      );
      expect(path).toEqual(['evaluate-policy', 'scoring/evaluate-policy']);
    });
    /* eslint-enable @typescript-eslint/unbound-method */
  });
});
