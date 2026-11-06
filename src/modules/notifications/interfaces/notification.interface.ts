import type { NotificationType } from '../enums/notification.enum.js';

export interface CreateNotificationInput {
  userId?: string | null;
  type: NotificationType | string;
  title: string;
  content?: string | null;
  message?: string | null;
  severity?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  reviewTaskId?: string | null;
  idempotencyKey?: string | null;
}
