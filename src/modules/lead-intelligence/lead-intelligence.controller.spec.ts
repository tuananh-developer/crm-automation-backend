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
});
