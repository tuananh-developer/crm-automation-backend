import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  CustomerTaskPriority,
  CustomerTaskStatus,
} from '../entities/customer-task.entity.js';

export class CreateCustomerTaskDto {
  @ApiProperty({ description: 'Customer UUID', format: 'uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({
    description: 'Task category/type',
    example: 'FEEDBACK_ESCALATION',
  })
  @IsNotEmpty()
  @IsString()
  taskType!: string;

  @ApiProperty({ description: 'Task title' })
  @IsNotEmpty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Task detailed description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: CustomerTaskPriority,
    default: CustomerTaskPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(CustomerTaskPriority)
  priority?: CustomerTaskPriority;

  @ApiPropertyOptional({
    enum: CustomerTaskStatus,
    default: CustomerTaskStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(CustomerTaskStatus)
  status?: CustomerTaskStatus;

  @ApiPropertyOptional({ description: 'Assignee user UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Due date timestamp' })
  @IsOptional()
  @IsString()
  dueAt?: string;

  @ApiProperty({
    description: 'Stable unique idempotency key for deduplication',
  })
  @IsNotEmpty()
  @IsString()
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Source entity type (e.g. CUSTOMER_FEEDBACK)',
  })
  @IsOptional()
  @IsString()
  sourceEntityType?: string;

  @ApiPropertyOptional({ description: 'Source entity ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sourceEntityId?: string;
}
