import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TriggerEnrichmentDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  /**
   * Enrichment provider to use (e.g. "clearbit", "hunter", "mock").
   * Defaults to the system-configured provider if omitted.
   */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  provider?: string;
}
