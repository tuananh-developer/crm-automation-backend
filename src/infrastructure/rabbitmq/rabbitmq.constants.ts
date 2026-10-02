export const CRM_EXCHANGE = 'crm.events';

export const CRM_EVENTS = {
  LEAD_CREATED: 'lead.created',
  LEAD_QUALIFICATION_REQUESTED: 'lead.qualification.requested',
  LEAD_ENRICHMENT_REQUESTED: 'lead.enrichment.requested',
  LEAD_SCORING_REQUESTED: 'lead.scoring.requested',
  FOLLOW_UP_TRIGGERED: 'lead.follow_up.triggered',
} as const;

export const DEFAULT_CRM_QUEUE = 'crm_automation_queue';
