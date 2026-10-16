import type { ExecutionStatus } from '../enums/follow-up.enum.js';
import type { FollowUpExecution } from '../entities/follow-up-execution.entity.js';

export interface N8nFollowUpResponse {
  success?: boolean;
  providerMessageId?: string | null;
  message?: string;
  error?: string;
}

export interface ExecuteFollowUpResult {
  execution: FollowUpExecution;
  status: ExecutionStatus;
  retryCount: number;
  message: string;
}
