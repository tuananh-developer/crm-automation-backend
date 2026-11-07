import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCustomerTaskDto {
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  assessmentId?: string | null;

  @IsOptional()
  @IsIn(['RETENTION'])
  taskType?: 'RETENTION';

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  score?: number;
}
