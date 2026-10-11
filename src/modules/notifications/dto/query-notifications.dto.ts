import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const DEFAULT_NOTIFICATION_LIMIT = 20;
export const MAX_NOTIFICATION_LIMIT = 100;

export class QueryNotificationsDto {
  /**
   * Owner of the notifications. The API has no authentication yet, so the
   * caller has to state whose inbox is being read.
   */
  @IsUUID()
  userId!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_NOTIFICATION_LIMIT)
  limit?: number;
}
