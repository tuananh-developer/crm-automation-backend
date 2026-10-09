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
import { Transform } from 'class-transformer';
import { EnrichmentStatus } from '../enums/lead-intelligence.enum.js';

export class EnrichmentCallbackDto {
  @IsUUID()
  leadId!: string;

  @IsUUID()
  @IsOptional()
  workflowRunId?: string;

  @IsEnum(EnrichmentStatus)
  status!: EnrichmentStatus;

  /** The enrichment provider that returned the data (e.g. "clearbit", "mock", "n8n"). */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  provider?: string;

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

  @IsString()
  @IsOptional()
  @MaxLength(150)
  industry?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') {
      const val = Math.floor(value);
      return val > 0 ? val : undefined;
    }
    if (typeof value === 'string') {
      const match = value.match(/\d+/);
      if (!match) return undefined;
      const parsed = parseInt(match[0], 10);
      return parsed > 0 ? parsed : undefined;
    }
    return undefined;
  })
  @IsInt()
  @Min(1)
  companySize?: number;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  contactJobTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  jobTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  contactLinkedinUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  linkedInUrl?: string;

  /** Full raw response payload from the enrichment provider. */
  @IsObject()
  @IsOptional()
  rawResponse?: Record<string, any>;

  /** Human-readable error message when status is FAILED or PARTIAL. */
  @IsString()
  @IsOptional()
  errorMessage?: string;
}
