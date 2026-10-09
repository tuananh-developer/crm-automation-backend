import { EnrichmentController } from './enrichment.controller.js';
import type { LeadIntelligenceService } from './lead-intelligence.service.js';
import { EnrichmentStatus } from './enums/lead-intelligence.enum.js';
import type { LeadEnrichment } from './entities/lead-enrichment.entity.js';

describe('EnrichmentController', () => {
  let controller: EnrichmentController;
  let service: jest.Mocked<Partial<LeadIntelligenceService>>;

  const mockEnrichment: LeadEnrichment = {
    id: 'enrich-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    provider: 'n8n',
    externalRequestId: null,
    status: EnrichmentStatus.SUCCESS,
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    companyIndustry: 'Tech',
    companySize: 100,
    contactJobTitle: 'CTO',
    contactLinkedinUrl: null,
    rawResponse: null,
    errorMessage: null,
    enrichedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(() => {
    service = {
      triggerEnrichment: jest.fn().mockResolvedValue({
        message: 'Lead enrichment workflow triggered successfully',
        workflowRunId: 'wf-run-123',
        enrichmentId: 'enrich-123',
        leadId: 'lead-123',
      }),
      handleEnrichmentCallback: jest.fn().mockResolvedValue({
        enrichment: mockEnrichment,
        workflowRunUpdated: true,
      }),
      getEnrichmentsByLead: jest.fn().mockResolvedValue([mockEnrichment]),
      getLatestEnrichment: jest.fn().mockResolvedValue(mockEnrichment),
      mockEnrichment: jest.fn().mockReturnValue({
        provider: 'mock',
        externalRequestId: 'ext-123',
        company: {
          name: 'Acme Solutions',
          website: 'https://acme.com',
          industry: 'Software & Technology',
          size: 150,
        },
        contact: {
          jobTitle: 'Director of Operations',
          linkedinUrl: 'https://linkedin.com/company/acme',
        },
        rawResponse: {
          source: 'mock-enrichment-v1',
          query: { domain: 'acme.com' },
          timestamp: new Date().toISOString(),
          score: 0.95,
        },
      }),
    };

    controller = new EnrichmentController(service as LeadIntelligenceService);
  });

  it('should trigger enrichment via service', async () => {
    const result = await controller.triggerEnrichment('lead-123', {
      provider: 'clearbit',
    });

    expect(service.triggerEnrichment).toHaveBeenCalledWith('lead-123', {
      provider: 'clearbit',
    });
    expect(result.workflowRunId).toBe('wf-run-123');
  });

  it('should handle enrichment callback via service', async () => {
    const dto = {
      leadId: 'lead-123',
      workflowRunId: 'wf-run-123',
      status: EnrichmentStatus.SUCCESS,
      companyName: 'Acme Corp',
    };

    const result = await controller.handleCallback(dto);

    expect(service.handleEnrichmentCallback).toHaveBeenCalledWith(dto);
    expect(result.workflowRunUpdated).toBe(true);
    expect(result.enrichment.companyName).toBe('Acme Corp');
  });

  it('should return mock enrichment data via service', () => {
    const result = controller.mockEnrichment(
      'acme.com',
      'john@acme.com',
      'mock',
      undefined,
    );

    expect(service.mockEnrichment).toHaveBeenCalledWith({
      domain: 'acme.com',
      email: 'john@acme.com',
      provider: 'mock',
      fail: undefined,
    });
    expect(result).toHaveProperty('company');
    expect(result.company.name).toBe('Acme Solutions');
  });

  it('should get all enrichments for a lead via service', async () => {
    const result = await controller.getEnrichmentsByLead('lead-123');

    expect(service.getEnrichmentsByLead).toHaveBeenCalledWith('lead-123');
    expect(result).toHaveLength(1);
  });

  it('should get latest enrichment for a lead via service', async () => {
    const result = await controller.getLatestEnrichment('lead-123');

    expect(service.getLatestEnrichment).toHaveBeenCalledWith('lead-123');
    expect(result?.id).toBe('enrich-123');
  });
});
