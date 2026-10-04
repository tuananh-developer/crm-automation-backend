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
