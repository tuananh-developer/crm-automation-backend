import { Injectable, Logger } from '@nestjs/common';

export interface AccountHealthInput {
  engagement: number | null;
  feedback: number | null;
  openIssues: number | null;
  followUpCompletion: number | null;
}

export interface AccountHealthResult {
  score: number;
  status: 'HEALTHY' | 'GOOD' | 'AT_RISK' | 'CRITICAL' | 'INSUFFICIENT_DATA';
  policyVersion: string;
  breakdown: {
    engagement: number | null;
    feedback: number | null;
    openIssues: number | null;
    followUpCompletion: number | null;
    weights: {
      engagement: number;
      feedback: number;
      openIssues: number;
      followUpCompletion: number;
    };
  };
  evidence: string[];
  missingData: string[];
}

export const ACCOUNT_HEALTH_POLICY_VERSION = 'v1';

export const ACCOUNT_HEALTH_WEIGHTS = {
  engagement: 0.3,
  feedback: 0.25,
  openIssues: 0.25,
  followUpCompletion: 0.2,
};

@Injectable()
export class AccountHealthService {
  private readonly logger = new Logger(AccountHealthService.name);

  calculate(
    input: AccountHealthInput,
    evidenceInput?: string[],
  ): AccountHealthResult {
    const missingData: string[] = [];
    if (input.engagement === null || input.engagement === undefined) {
      missingData.push('engagement');
    }
    if (input.feedback === null || input.feedback === undefined) {
      missingData.push('feedback');
    }
    if (input.openIssues === null || input.openIssues === undefined) {
      missingData.push('openIssues');
    }
    if (
      input.followUpCompletion === null ||
      input.followUpCompletion === undefined
    ) {
      missingData.push('followUpCompletion');
    }

    if (missingData.length > 0) {
      return {
        score: 0,
        status: 'INSUFFICIENT_DATA',
        policyVersion: ACCOUNT_HEALTH_POLICY_VERSION,
        breakdown: {
          engagement: input.engagement ?? null,
          feedback: input.feedback ?? null,
          openIssues: input.openIssues ?? null,
          followUpCompletion: input.followUpCompletion ?? null,
          weights: ACCOUNT_HEALTH_WEIGHTS,
        },
        evidence: evidenceInput ?? [],
        missingData,
      };
    }

    const engagement = Math.min(100, Math.max(0, input.engagement as number));
    const feedback = Math.min(100, Math.max(0, input.feedback as number));
    const openIssues = Math.min(100, Math.max(0, input.openIssues as number));
    const followUpCompletion = Math.min(
      100,
      Math.max(0, input.followUpCompletion as number),
    );

    const score = Math.round(
      engagement * ACCOUNT_HEALTH_WEIGHTS.engagement +
        feedback * ACCOUNT_HEALTH_WEIGHTS.feedback +
        openIssues * ACCOUNT_HEALTH_WEIGHTS.openIssues +
        followUpCompletion * ACCOUNT_HEALTH_WEIGHTS.followUpCompletion,
    );

    let status: AccountHealthResult['status'];
    if (score >= 80) status = 'HEALTHY';
    else if (score >= 60) status = 'GOOD';
    else if (score >= 40) status = 'AT_RISK';
    else status = 'CRITICAL';

    const evidence: string[] =
      evidenceInput && evidenceInput.length > 0
        ? evidenceInput
        : [
            `Engagement score: ${engagement}/100 (weight: ${ACCOUNT_HEALTH_WEIGHTS.engagement * 100}%)`,
            `Feedback score: ${feedback}/100 (weight: ${ACCOUNT_HEALTH_WEIGHTS.feedback * 100}%)`,
            `Open issues resolution metric: ${openIssues}/100 (weight: ${ACCOUNT_HEALTH_WEIGHTS.openIssues * 100}%)`,
            `Follow-up completion: ${followUpCompletion}/100 (weight: ${ACCOUNT_HEALTH_WEIGHTS.followUpCompletion * 100}%)`,
          ];

    return {
      score,
      status,
      policyVersion: ACCOUNT_HEALTH_POLICY_VERSION,
      breakdown: {
        engagement,
        feedback,
        openIssues,
        followUpCompletion,
        weights: ACCOUNT_HEALTH_WEIGHTS,
      },
      evidence,
      missingData: [],
    };
  }
}
