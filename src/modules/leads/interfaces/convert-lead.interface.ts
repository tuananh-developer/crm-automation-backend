import type { Lead } from '../entities/lead.entity.js';
import type { Customer } from '../../customers/entities/customer.entity.js';

export type CustomerMatchSource = 'EMAIL' | 'PHONE';

export interface ConvertLeadResult {
  lead: Lead;
  customer: Customer;
  customerCreated: boolean;
  matchedBy: CustomerMatchSource | null;
  message: string;
}
