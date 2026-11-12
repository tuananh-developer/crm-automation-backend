import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateContractDto {
  @ApiProperty({ description: 'Customer UUID', format: 'uuid' })
  @IsUUID('all')
  @IsNotEmpty()
  customerId!: string;

  @ApiProperty({ description: 'Unique contract number', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contractNumber!: string;

  @ApiPropertyOptional({
    description: 'Contract status',
    default: 'ACTIVE',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @ApiProperty({ description: 'Contract start date (ISO-8601)' })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ description: 'Contract end date (ISO-8601)' })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({
    description: 'Scheduled renewal date (ISO-8601)',
  })
  @IsOptional()
  @IsDateString()
  renewalDate?: string;

  @ApiPropertyOptional({ description: 'Contract monetary value', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class UpdateContractDto {
  @ApiPropertyOptional({ description: 'Contract status', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @ApiPropertyOptional({ description: 'Contract end date (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Scheduled renewal date (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  renewalDate?: string;

  @ApiPropertyOptional({ description: 'Contract monetary value', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class CalculateUrgencyDto {
  @ApiPropertyOptional({
    description: 'Contract renewal date (ISO-8601)',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  renewalDate?: string;
}

export class SaveRenewalDraftDto {
  @ApiProperty({ description: 'Target contract UUID', format: 'uuid' })
  @IsUUID('all')
  @IsNotEmpty()
  contractId!: string;

  @ApiProperty({ description: 'Target customer UUID', format: 'uuid' })
  @IsUUID('all')
  @IsNotEmpty()
  customerId!: string;

  @ApiPropertyOptional({ description: 'Renewal date (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  renewalDate?: string;

  @ApiPropertyOptional({ description: 'Computed urgency level', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  urgency?: string;

  @ApiPropertyOptional({ description: 'AI generated renewal recommendation' })
  @IsOptional()
  @IsString()
  recommendation?: string;

  @ApiPropertyOptional({ description: 'AI drafted renewal proposal content' })
  @IsOptional()
  @IsString()
  draftContent?: string;

  @ApiPropertyOptional({
    description: 'Draft status',
    default: 'DRAFT',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @ApiProperty({
    description: 'Idempotency key to prevent duplicate drafts on retry',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'AI model used for draft',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  aiModel?: string;

  @ApiPropertyOptional({
    description: 'Backend validation and verification provenance metadata',
  })
  @IsOptional()
  @IsObject()
  validationResult?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Error code if any', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  errorCode?: string;

  @ApiPropertyOptional({ description: 'Detailed error message if any' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({
    description: 'Associated workflow execution ID',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workflowExecutionId?: string;

  @ApiPropertyOptional({
    description: 'Associated communication delivery ID',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  communicationId?: string;
}

export class CheckEligibilityDto {
  @ApiProperty({ description: 'Contract UUID', format: 'uuid' })
  @IsUUID('all')
  @IsNotEmpty()
  contractId!: string;

  @ApiProperty({ description: 'Customer UUID', format: 'uuid' })
  @IsUUID('all')
  @IsNotEmpty()
  customerId!: string;

  @ApiPropertyOptional({ description: 'Renewal draft UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  draftId?: string;

  @ApiPropertyOptional({
    description:
      'Advisory caller boolean. NEVER trusted by backend; authoritative consent record required.',
  })
  @IsOptional()
  @IsBoolean()
  hasConsent?: boolean;

  @ApiPropertyOptional({
    description:
      'Advisory caller boolean. NEVER trusted by backend; approved template record required.',
  })
  @IsOptional()
  @IsBoolean()
  hasTemplate?: boolean;

  @ApiPropertyOptional({
    description:
      'Advisory caller boolean. NEVER trusted by backend; policy permission required.',
  })
  @IsOptional()
  @IsBoolean()
  policyAllows?: boolean;

  @ApiPropertyOptional({
    description:
      'Advisory caller boolean. NEVER trusted by backend; human approval record required.',
  })
  @IsOptional()
  @IsBoolean()
  needsApproval?: boolean;
}

export class RecordRenewalAttemptDto {
  @ApiProperty({ description: 'Contract UUID', format: 'uuid' })
  @IsUUID('all')
  @IsNotEmpty()
  contractId!: string;

  @ApiPropertyOptional({ description: 'Customer UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  customerId?: string;

  @ApiProperty({
    description: 'Attempt outcome status: SENT, FAILED, or PENDING_APPROVAL',
  })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiProperty({
    description: 'Idempotency key for attempt recording',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  idempotencyKey!: string;

  @ApiPropertyOptional({ description: 'Communication delivery ID' })
  @IsOptional()
  @IsString()
  communicationId?: string;

  @ApiPropertyOptional({ description: 'Error code' })
  @IsOptional()
  @IsString()
  errorCode?: string;

  @ApiPropertyOptional({ description: 'Error message' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
