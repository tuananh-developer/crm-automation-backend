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

  @ApiPropertyOptional({ description: 'User ID to notify' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
