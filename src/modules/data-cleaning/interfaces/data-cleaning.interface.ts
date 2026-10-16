export type IssueType =
  | 'MISSING_FIELD'
  | 'INVALID_EMAIL'
  | 'INVALID_WEBSITE'
  | 'INCONSISTENT_PHONE'
  | 'DUPLICATE_CANDIDATE'
  | 'DOMAIN_MISMATCH'
  | 'WHITESPACE_TRIM'
  | 'CASE_NORMALIZATION'
  | 'INCONSISTENT_DATA';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DataCleaningFinding {
  id: string;
  recordType: 'Lead';
  recordId: string;
  leadIdentifier?: string;
  fieldName: string;
  issueType: IssueType;
  severity: Severity;
  currentValue: unknown;
  proposedValue: unknown;
  confidence: number;
  reason: string;
  safeToApply: boolean;
  requiresHumanApproval: boolean;
}

export interface DataCleaningSummary {
  totalLeadsScanned: number;
  totalIssuesFound: number;
  issuesByType: Record<string, number>;
  issuesBySeverity: Record<string, number>;
  duplicatesFound: number;
  safeToApplyCount: number;
}

export interface DataCleaningReport {
  summary: DataCleaningSummary;
  findings: DataCleaningFinding[];
}

export interface AppliedFindingResult {
  findingId: string;
  leadId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  status: 'APPLIED' | 'SKIPPED';
  skipReason?: string;
}

export interface ApplyCleaningResult {
  workflowRunId: string;
  appliedCount: number;
  skippedCount: number;
  totalRequested: number;
  results: AppliedFindingResult[];
}

export type AllowedCleaningField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'companyName'
  | 'companyWebsite'
  | 'jobTitle'
  | 'industry';

export interface ScanInputPayload {
  scope: 'ALL' | 'FILTER';
  filter?: {
    status?: string;
    sourceId?: string;
    search?: string;
    limit?: number;
  } | null;
  requestedAt?: string;
}

export interface AppliedStatItem {
  appliedAt: string;
  userId: string | null;
  appliedCount: number;
  skippedCount: number;
  totalRequested: number;
}

export interface ScanOutputPayload {
  summary?: DataCleaningSummary | null;
  findings?: DataCleaningFinding[];
  appliedStats?: AppliedStatItem[];
  receivedAt?: string;
}
