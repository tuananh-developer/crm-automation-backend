import 'reflect-metadata';
import {
  AccountHealthService,
  ACCOUNT_HEALTH_POLICY_VERSION,
  ACCOUNT_HEALTH_WEIGHTS,
} from './account-health.service.js';

describe('AccountHealthService', () => {
  let service: AccountHealthService;

  beforeEach(() => {
    service = new AccountHealthService();
  });

  it('calculates HEALTHY status when score >= 80 using policy v1 weights', () => {
    // 80*0.3 + 80*0.25 + 80*0.25 + 80*0.2 = 80
    const result = service.calculate({
      engagement: 80,
      feedback: 80,
      openIssues: 80,
      followUpCompletion: 80,
    });

    expect(result.score).toBe(80);
    expect(result.status).toBe('HEALTHY');
    expect(result.policyVersion).toBe(ACCOUNT_HEALTH_POLICY_VERSION);
    expect(result.missingData).toHaveLength(0);
    expect(result.breakdown.weights).toEqual(ACCOUNT_HEALTH_WEIGHTS);
  });

  it('calculates GOOD status when score is between 60 and 79', () => {
    // 70*0.3 (21) + 60*0.25 (15) + 80*0.25 (20) + 70*0.2 (14) = 70
    const result = service.calculate({
      engagement: 70,
      feedback: 60,
      openIssues: 80,
      followUpCompletion: 70,
    });

    expect(result.score).toBe(70);
    expect(result.status).toBe('GOOD');
  });

  it('calculates AT_RISK status when score is between 40 and 59', () => {
    // 40*0.3 (12) + 50*0.25 (12.5) + 40*0.25 (10) + 60*0.2 (12) = 46.5 -> 47
    const result = service.calculate({
      engagement: 40,
      feedback: 50,
      openIssues: 40,
      followUpCompletion: 60,
    });

    expect(result.score).toBe(47);
    expect(result.status).toBe('AT_RISK');
  });

  it('calculates CRITICAL status when score < 40', () => {
    const result = service.calculate({
      engagement: 20,
      feedback: 30,
      openIssues: 20,
      followUpCompletion: 30,
    });

    expect(result.score).toBeLessThan(40);
    expect(result.status).toBe('CRITICAL');
  });

  it('returns INSUFFICIENT_DATA when any metric is null or missing', () => {
    const result = service.calculate({
      engagement: 80,
      feedback: null,
      openIssues: 90,
      followUpCompletion: 85,
    });

    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.score).toBe(0);
    expect(result.missingData).toContain('feedback');
    expect(result.missingData).not.toContain('engagement');
  });

  it('returns all missing metrics in missingData array', () => {
    const result = service.calculate({
      engagement: null,
      feedback: null,
      openIssues: null,
      followUpCompletion: null,
    });

    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.missingData).toEqual([
      'engagement',
      'feedback',
      'openIssues',
      'followUpCompletion',
    ]);
  });

  it('clamps input values to 0 - 100 bounds', () => {
    const result = service.calculate({
      engagement: 150,
      feedback: 100,
      openIssues: 100,
      followUpCompletion: 100,
    });

    expect(result.score).toBe(100);
    expect(result.breakdown.engagement).toBe(100);
  });

  it('differentiates scores between customers with different metrics', () => {
    const customerA = service.calculate({
      engagement: 90,
      feedback: 90,
      openIssues: 100,
      followUpCompletion: 90,
    });

    const customerB = service.calculate({
      engagement: 30,
      feedback: 40,
      openIssues: 20,
      followUpCompletion: 50,
    });

    expect(customerA.score).toBeGreaterThan(customerB.score);
    expect(customerA.status).not.toEqual(customerB.status);
  });
});
