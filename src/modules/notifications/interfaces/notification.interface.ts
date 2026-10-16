import type { NotificationType } from '../enums/notification.enum.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType | string;
  title: string;
  content?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  reviewTaskId?: string | null;
}
