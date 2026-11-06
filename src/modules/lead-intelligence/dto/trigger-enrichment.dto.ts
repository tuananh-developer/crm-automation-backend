import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TriggerEnrichmentDto {
  /**
   * Enrichment provider to use (e.g. "clearbit", "hunter", "mock").
   * Defaults to the system-configured provider if omitted.
   */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  provider?: string;
}
