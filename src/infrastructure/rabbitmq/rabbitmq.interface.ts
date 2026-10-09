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

export interface LeadScoringRequestedEventData {
  leadId: string;
  workflowRunId: string;
  scoringContext?: Record<string, any>;
  leadData?: Record<string, any>;
  qualificationData?: Record<string, any> | null;
  enrichmentData?: Record<string, any> | null;
  interactions?: Array<Record<string, any>>;
}
