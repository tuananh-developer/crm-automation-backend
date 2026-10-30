import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  ActionItemApprovalState,
  ActionItemStatus,
} from '../entities/conversation-action-item.entity.js';

export class UpdateActionItemDto {
  @ApiPropertyOptional({ description: 'Action item title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Assignee user UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Due date timestamp' })
  @IsOptional()
  @IsString()
  dueAt?: string;

  @ApiPropertyOptional({ enum: ActionItemStatus })
  @IsOptional()
  @IsEnum(ActionItemStatus)
  status?: ActionItemStatus;

  @ApiPropertyOptional({ enum: ActionItemApprovalState })
  @IsOptional()
  @IsEnum(ActionItemApprovalState)
  approvalState?: ActionItemApprovalState;
}
