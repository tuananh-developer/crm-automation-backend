import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationSeverity,
  NotificationType,
} from '../enums/notification.enum.js';

export class CreateInternalNotificationDto {
  @ApiPropertyOptional({
    description:
      'Target user ID. If omitted, will be resolved from lead owner.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ enum: NotificationType, description: 'Notification type' })
  @IsNotEmpty()
  @IsString()
  type!: NotificationType | string;

  @ApiProperty({ description: 'Notification title' })
  @IsNotEmpty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Notification message or content' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Notification content alias' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    enum: NotificationSeverity,
    description: 'Notification severity',
  })
  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @ApiPropertyOptional({ description: 'Associated lead ID' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ description: 'Associated customer ID' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Associated review task ID' })
  @IsOptional()
  @IsUUID()
  reviewTaskId?: string;
}
