import type { LeadEnrichment } from '../entities/lead-enrichment.entity.js';
import { EnrichmentStatus } from '../enums/lead-intelligence.enum.js';
import {
  EnrichmentCallbackResponseDto,
  EnrichmentResponseDto,
} from '../dto/enrichment-response.dto.js';

export class EnrichmentMapper {
  static toResponseDto(
    entity: LeadEnrichment | Record<string, unknown>,
  ): EnrichmentResponseDto {
    const rec = entity as Record<string, unknown>;
    const raw =
      rec.rawResponse && typeof rec.rawResponse === 'object'
        ? (rec.rawResponse as Record<string, unknown>)
        : null;
    const rawCompany =
      raw && typeof raw.company === 'object' && raw.company !== null
        ? (raw.company as Record<string, unknown>)
        : null;

    const revCandidate =
      rec.revenueRange ??
      raw?.revenueRange ??
      raw?.revenue_range ??
      rawCompany?.revenueRange ??
      rawCompany?.revenue_range ??
      null;

    const revenueRange = typeof revCandidate === 'string' ? revCandidate : null;

    const companyIndustry =
      (typeof rec.companyIndustry === 'string' ? rec.companyIndustry : null) ??
      (typeof rec.industry === 'string' ? rec.industry : null);

    const contactLinkedinUrl =
      (typeof rec.contactLinkedinUrl === 'string'
        ? rec.contactLinkedinUrl
        : null) ??
      (typeof rec.linkedinUrl === 'string' ? rec.linkedinUrl : null);

    return {
      id: typeof rec.id === 'string' ? rec.id : '',
      leadId: typeof rec.leadId === 'string' ? rec.leadId : '',
      workflowRunId:
        typeof rec.workflowRunId === 'string' ? rec.workflowRunId : null,
      provider: typeof rec.provider === 'string' ? rec.provider : 'mock',
      externalRequestId:
        typeof rec.externalRequestId === 'string'
          ? rec.externalRequestId
          : null,
      status: (rec.status as EnrichmentStatus) ?? EnrichmentStatus.SUCCESS,
      companyName: typeof rec.companyName === 'string' ? rec.companyName : null,
      companyWebsite:
        typeof rec.companyWebsite === 'string' ? rec.companyWebsite : null,
      companyIndustry,
      industry: companyIndustry,
      companySize: typeof rec.companySize === 'number' ? rec.companySize : null,
      revenueRange,
      contactJobTitle:
        (typeof rec.contactJobTitle === 'string'
          ? rec.contactJobTitle
          : null) ?? (typeof rec.jobTitle === 'string' ? rec.jobTitle : null),
      contactLinkedinUrl,
      linkedinUrl: contactLinkedinUrl,
      rawResponse: raw,
      errorMessage:
        typeof rec.errorMessage === 'string' ? rec.errorMessage : null,
      enrichedAt: rec.enrichedAt instanceof Date ? rec.enrichedAt : new Date(),
      createdAt: rec.createdAt instanceof Date ? rec.createdAt : new Date(),
    };
  }

  static toResponseDtoList(
    entities: (LeadEnrichment | Record<string, unknown>)[],
  ): EnrichmentResponseDto[] {
    return entities.map((item) => this.toResponseDto(item));
  }

  static toCallbackResponseDto(result: {
    enrichment: LeadEnrichment | Record<string, unknown>;
    workflowRunUpdated: boolean;
  }): EnrichmentCallbackResponseDto {
    return {
      enrichment: this.toResponseDto(result.enrichment),
      workflowRunUpdated: result.workflowRunUpdated,
    };
  }
}
