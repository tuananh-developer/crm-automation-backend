import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  NotificationSeverity,
  NotificationType,
} from '../enums/notification.enum.js';

export class CreateInternalNotificationDto {
  @ApiPropertyOptional({ description: 'Recipient user UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiProperty({
    description: 'Notification category type',
    enum: NotificationType,
    example: NotificationType.WORKFLOW_COMPLETED,
  })
  @IsNotEmpty()
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ description: 'Notification title' })
  @IsNotEmpty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Notification message body' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Alternative notification content body' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Severity level',
    enum: NotificationSeverity,
    default: NotificationSeverity.INFO,
  })
  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @ApiPropertyOptional({ description: 'Associated lead UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  leadId?: string;

  @ApiPropertyOptional({
    description: 'Associated customer UUID',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Associated review task UUID',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  reviewTaskId?: string;

  @ApiPropertyOptional({ description: 'Idempotency key for deduplication' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
