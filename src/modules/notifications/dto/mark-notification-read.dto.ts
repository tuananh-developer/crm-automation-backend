import { IsOptional, IsUUID } from 'class-validator';

export class MarkNotificationReadDto {
  /** Optional inbox selector for Admin; Sales ownership comes from JWT. */
  @IsOptional()
  @IsUUID()
  userId?: string;
}
