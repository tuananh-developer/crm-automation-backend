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
  breakdown: {
    engagement: number | null;
    feedback: number | null;
    openIssues: number | null;
    followUpCompletion: number | null;
  };
  evidence: string[];
  missingData: string[];
}

const WEIGHTS = {
  engagement: 0.3,
  feedback: 0.25,
  openIssues: 0.25,
  followUpCompletion: 0.2,
};

@Injectable()
export class AccountHealthService {
  private readonly logger = new Logger(AccountHealthService.name);

  calculate(input: AccountHealthInput): AccountHealthResult {
    const missingData: string[] = [];
    if (input.engagement === null) missingData.push('engagement');
    if (input.feedback === null) missingData.push('feedback');
    if (input.openIssues === null) missingData.push('openIssues');
    if (input.followUpCompletion === null)
      missingData.push('followUpCompletion');

    if (missingData.length > 0) {
      return {
        score: 0,
        status: 'INSUFFICIENT_DATA',
        breakdown: {
          engagement: input.engagement,
          feedback: input.feedback,
          openIssues: input.openIssues,
          followUpCompletion: input.followUpCompletion,
        },
        evidence: [],
        missingData,
      };
    }

    const engagement = input.engagement as number;
    const feedback = input.feedback as number;
    const openIssues = input.openIssues as number;
    const followUpCompletion = input.followUpCompletion as number;

    const score = Math.round(
      engagement * WEIGHTS.engagement +
        feedback * WEIGHTS.feedback +
        openIssues * WEIGHTS.openIssues +
        followUpCompletion * WEIGHTS.followUpCompletion,
    );

    let status: AccountHealthResult['status'];
    if (score >= 80) status = 'HEALTHY';
    else if (score >= 60) status = 'GOOD';
    else if (score >= 40) status = 'AT_RISK';
    else status = 'CRITICAL';

    return {
      score,
      status,
      breakdown: {
        engagement,
        feedback,
        openIssues,
        followUpCompletion,
      },
      evidence: [],
      missingData: [],
    };
  }
}
