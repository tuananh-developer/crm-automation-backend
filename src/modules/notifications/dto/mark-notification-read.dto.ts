import { IsUUID } from 'class-validator';

export class MarkNotificationReadDto {
  /** Owner of the notification; prevents reading another user's inbox. */
  @IsUUID()
  userId!: string;
}
