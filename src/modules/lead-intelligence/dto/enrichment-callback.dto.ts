import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EnrichmentStatus } from '../enums/lead-intelligence.enum.js';

export class EnrichmentCallbackDto {
  @IsUUID()
  leadId!: string;

  @IsUUID()
  @IsOptional()
  workflowRunId?: string;

  @IsEnum(EnrichmentStatus)
  status!: EnrichmentStatus;

  /** The enrichment provider that returned the data (e.g. "clearbit", "mock"). */
  @IsString()
  @MaxLength(100)
  provider!: string;

  /** External request / correlation ID provided by the enrichment API. */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  externalRequestId?: string;

  // ── Enriched fields ─────────────────────────────────────────────────────

  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  companyWebsite?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  companyIndustry?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  companySize?: number;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  contactJobTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  contactLinkedinUrl?: string;

  /** Full raw response payload from the enrichment provider. */
  @IsObject()
  @IsOptional()
  rawResponse?: Record<string, any>;

  /** Human-readable error message when status is FAILED or PARTIAL. */
  @IsString()
  @IsOptional()
  errorMessage?: string;
}
