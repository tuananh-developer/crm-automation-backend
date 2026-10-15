import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  DataCleaningFinding,
  DataCleaningSummary,
  IssueType,
  Severity,
} from '../interfaces/data-cleaning.interface.js';

export class CleaningFindingDto implements DataCleaningFinding {
  @ApiProperty({ description: 'Unique finding ID', format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Record type', default: 'Lead' })
  @IsIn(['Lead'])
  recordType!: 'Lead';

  @ApiProperty({ description: 'Lead ID', format: 'uuid' })
  @IsUUID()
  recordId!: string;

  @ApiPropertyOptional({ description: 'Display name or email of the lead' })
  @IsOptional()
  @IsString()
  leadIdentifier?: string;

  @ApiProperty({
    description: 'Target field name (e.g. email, phone, companyWebsite)',
  })
  @IsString()
  fieldName!: string;

  @ApiProperty({
    description: 'Type of data quality issue detected',
    example: 'INVALID_EMAIL',
  })
  @IsString()
  issueType!: IssueType;

  @ApiProperty({ description: 'Severity of the issue', example: 'MEDIUM' })
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity!: Severity;

  @ApiProperty({ description: 'Current value in database' })
  currentValue!: unknown;

  @ApiProperty({ description: 'Proposed remediated value' })
  proposedValue!: unknown;

  @ApiProperty({ description: 'Confidence score (0.0 to 1.0)', example: 0.95 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @ApiProperty({ description: 'Explanation or rationale for the proposal' })
  @IsString()
  reason!: string;

  @ApiProperty({
    description: 'Whether it is safe to apply deterministically without risk',
    default: true,
  })
  @IsBoolean()
  safeToApply!: boolean;

  @ApiProperty({
    description: 'Whether this change requires human confirmation before apply',
    default: true,
  })
  @IsBoolean()
  requiresHumanApproval!: boolean;
}

export class CleaningSummaryDto implements DataCleaningSummary {
  @ApiProperty({ description: 'Total number of leads scanned' })
  @IsNumber()
  totalLeadsScanned!: number;

  @ApiProperty({ description: 'Total issues found' })
  @IsNumber()
  totalIssuesFound!: number;

  @ApiProperty({ description: 'Breakdown of issues by type' })
  @IsObject()
  issuesByType!: Record<string, number>;

  @ApiProperty({ description: 'Breakdown of issues by severity' })
  @IsObject()
  issuesBySeverity!: Record<string, number>;

  @ApiProperty({ description: 'Number of potential duplicate candidates' })
  @IsNumber()
  duplicatesFound!: number;

  @ApiProperty({ description: 'Number of findings safe to auto-apply' })
  @IsNumber()
  safeToApplyCount!: number;
}

export class DataCleaningCallbackDto {
  @ApiProperty({
    description: 'UUID of the WorkflowRun tracking this scan',
    format: 'uuid',
  })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({
    description: 'Overall status of the cleaning workflow execution',
    enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
    default: 'SUCCESS',
  })
  @IsIn(['SUCCESS', 'FAILED', 'PARTIAL'])
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' = 'SUCCESS';

  @ApiProperty({
    description: 'Statistical summary of the scan',
    type: CleaningSummaryDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => CleaningSummaryDto)
  summary!: CleaningSummaryDto;

  @ApiProperty({
    description: 'List of all detected issues and remediation proposals',
    type: [CleaningFindingDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CleaningFindingDto)
  findings!: CleaningFindingDto[];

  @ApiPropertyOptional({ description: 'Error message if scan failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
