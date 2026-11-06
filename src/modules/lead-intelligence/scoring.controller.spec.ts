import { ScoringController } from './scoring.controller.js';
import type { LeadIntelligenceService } from './lead-intelligence.service.js';
import { ScoreLabel } from './enums/lead-intelligence.enum.js';
import type { LeadScore } from './entities/lead-score.entity.js';
import type { ScoringCallbackDto } from './dto/scoring-callback.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';

describe('ScoringController', () => {
  let controller: ScoringController;
  let service: jest.Mocked<Partial<LeadIntelligenceService>>;
  const actor: AuthenticatedUser = {
    id: 'user-owner-123',
    name: 'Sales Rep',
    email: 'sales@example.test',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockScore: LeadScore = {
    id: 'score-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    score: 85,
    label: ScoreLabel.HOT,
    factors: { companySize: 10, industry: 15 },
    modelProvider: 'rule-based',
    modelVersion: '1.0',
    scoringMethod: 'rule-engine',
    inputSnapshot: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as LeadScore;

  const mockActor: AuthenticatedUser = {
    id: 'user-actor-456',
    name: 'Actor Rep',
    email: 'actor@example.test',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    service = {
      triggerScoring: jest.fn().mockResolvedValue({
        workflowRunId: 'wf-run-123',
        status: 'PENDING',
        message: 'Scoring triggered',
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
    const result = await controller.triggerScoring(
      'lead-123',
      undefined,
      actor,
    );

    expect(service.triggerScoring).toHaveBeenCalledWith(
      'lead-123',
      undefined,
      actor,
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
    const result = await controller.getScoringContext('lead-123', actor);

    expect(service.getScoringContext).toHaveBeenCalledWith('lead-123', actor);
    expect(result.lead.id).toBe('lead-123');
  });

  it('should return score history', async () => {
    const result = await controller.getScores('lead-123', actor);

    expect(service.getScoresByLead).toHaveBeenCalledWith('lead-123', actor);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('score-123');
  });

  it('should return latest score', async () => {
    const result = await controller.getLatestScore('lead-123', actor);

    expect(service.getLatestScore).toHaveBeenCalledWith('lead-123', actor);
    expect(result?.label).toBe(ScoreLabel.HOT);
  });

  describe('Authorization Metadata', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    it('should protect triggerScoring endpoint with JwtAuthGuard metadata', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        ScoringController.prototype.triggerScoring,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });
    /* eslint-enable @typescript-eslint/unbound-method */
  });
});
