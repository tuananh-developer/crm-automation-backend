import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../enums/notification.enum.js';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum NotificationSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ enum: NotificationSeverity })
  @IsEnum(NotificationSeverity)
  severity!: NotificationSeverity;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ description: 'Notification message' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: 'Reference entity type' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference entity ID' })
  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Workflow run ID' })
  @IsOptional()
  @IsUUID()
  workflowRunId?: string;

  @ApiProperty({ description: 'Existing user ID to notify', format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    description: 'Idempotency key for duplicate callbacks',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}
