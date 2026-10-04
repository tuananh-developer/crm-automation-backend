export interface CrmEvent<T = Record<string, any>> {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  data: T;
}

export interface LeadCreatedEventData {
  leadId: string;
}

export interface LeadQualificationRequestedEventData {
  leadId: string;
  workflowRunId?: string;
}

export interface LeadEnrichmentRequestedEventData {
  leadId: string;
  workflowRunId: string;
  provider: string;
  email?: string;
  companyName?: string;
  companyWebsite?: string;
}

export interface LeadScoringRequestedEventData {
  leadId: string;
  workflowRunId: string;
  scoringContext?: Record<string, any>;
}

export interface FollowUpTriggeredEventData {
  enrollmentId: string;
  leadId: string;
  sequenceId: string;
  stepId?: string;
  scheduledAt?: string;
}
