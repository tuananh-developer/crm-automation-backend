import { LeadIntelligenceController } from './lead-intelligence.controller.js';
import type { LeadIntelligenceService } from './lead-intelligence.service.js';
import { QualificationStatus } from './enums/lead-intelligence.enum.js';
import { LeadStatus } from '../leads/enums/lead.enum.js';
import type { LeadQualification } from './entities/lead-qualification.entity.js';

describe('LeadIntelligenceController', () => {
  let controller: LeadIntelligenceController;
  let service: jest.Mocked<Partial<LeadIntelligenceService>>;

  const mockQualification: LeadQualification = {
    id: 'qual-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    status: QualificationStatus.QUALIFIED,
    intent: 'B2B CRM adoption',
    confidence: 0.92,
    reason: 'Clear requirements and budget match',
    modelProvider: 'openai',
    modelName: 'gpt-4o',
    modelVersion: '2024-08-06',
    inputSnapshot: {},
    outputSnapshot: {},
    createdAt: new Date(),
  };

  beforeEach(() => {
    service = {
      triggerQualification: jest.fn().mockResolvedValue({
        message: 'Triggered',
        workflowRunId: 'wf-run-123',
        leadId: 'lead-123',
      }),
      handleQualificationCallback: jest.fn().mockResolvedValue({
        qualification: mockQualification,
        leadStatus: LeadStatus.QUALIFIED,
        reviewRequired: false,
      }),
      getQualificationsByLead: jest.fn().mockResolvedValue([mockQualification]),
      getLatestQualification: jest.fn().mockResolvedValue(mockQualification),
      triggerEnrichment: jest.fn().mockResolvedValue({
        message: 'Lead enrichment workflow triggered successfully',
        workflowRunId: 'wf-run-123',
        enrichmentId: 'enrich-123',
        leadId: 'lead-123',
      }),
      getEnrichmentsByLead: jest.fn().mockResolvedValue([
        {
          id: 'enrich-123',
          leadId: 'lead-123',
          status: 'SUCCESS',
        },
      ]),
      getLatestEnrichment: jest.fn().mockResolvedValue({
        id: 'enrich-123',
        leadId: 'lead-123',
        status: 'SUCCESS',
      }),
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

    controller = new LeadIntelligenceController(
      service as LeadIntelligenceService,
    );
  });

  it('should trigger qualification via service', async () => {
    const result = await controller.triggerQualification('lead-123');

    expect(service.triggerQualification).toHaveBeenCalledWith(
      'lead-123',
      undefined,
    );
    expect(result.workflowRunId).toBe('wf-run-123');
  });

  it('should handle callback via service', async () => {
    const dto = {
      leadId: 'lead-123',
      status: QualificationStatus.QUALIFIED,
      confidence: 0.92,
    };
    const result = await controller.handleCallback(dto);

    expect(service.handleQualificationCallback).toHaveBeenCalledWith(dto);
    expect(result.leadStatus).toBe(LeadStatus.QUALIFIED);
    expect(result.reviewRequired).toBe(false);
  });

  it('should get all qualifications for a lead', async () => {
    const result = await controller.getQualifications('lead-123');

    expect(service.getQualificationsByLead).toHaveBeenCalledWith('lead-123');
    expect(result).toHaveLength(1);
  });

  it('should get latest qualification for a lead', async () => {
    const result = await controller.getLatestQualification('lead-123');

    expect(service.getLatestQualification).toHaveBeenCalledWith('lead-123');
    expect(result?.id).toBe('qual-123');
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

  it('should trigger enrichment via service', async () => {
    const result = await controller.triggerEnrichment('lead-123');

    expect(service.triggerEnrichment).toHaveBeenCalledWith(
      'lead-123',
      undefined,
    );
    expect(result.workflowRunId).toBe('wf-run-123');
  });

  it('should get all enrichments for a lead', async () => {
    const result = await controller.getEnrichments('lead-123');

    expect(service.getEnrichmentsByLead).toHaveBeenCalledWith('lead-123');
    expect(result).toHaveLength(1);
  });

  it('should get latest enrichment for a lead', async () => {
    const result = await controller.getLatestEnrichment('lead-123');

    expect(service.getLatestEnrichment).toHaveBeenCalledWith('lead-123');
    expect(result?.id).toBe('enrich-123');
  });
});
