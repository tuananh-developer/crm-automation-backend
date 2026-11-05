export const CRM_EXCHANGE = 'crm.events';

export const CRM_EVENTS = {
  LEAD_CREATED: 'lead.created',
  LEAD_QUALIFICATION_REQUESTED: 'lead.qualification.requested',
  LEAD_ENRICHMENT_REQUESTED: 'lead.enrichment.requested',
  LEAD_SCORING_REQUESTED: 'lead.scoring.requested',
  FOLLOW_UP_TRIGGERED: 'lead.follow_up.triggered',
  DATA_CLEANING_REQUESTED: 'data.cleaning.requested',
} as const;

export const LEGACY_CRM_QUEUE = 'crm_events_queue';
export const LEAD_CREATED_QUEUE = 'crm.audit.lead-created.q';
export const QUALIFICATION_QUEUE = 'n8n.lead-qualification.q';
export const ENRICHMENT_QUEUE = 'n8n.lead-enrichment.q';
export const SCORING_QUEUE = 'n8n.lead-scoring.q';
export const DATA_CLEANING_QUEUE = 'n8n.data-cleaning.q';
export const FOLLOW_UP_QUEUE = 'n8n.follow-up-execution.q';
