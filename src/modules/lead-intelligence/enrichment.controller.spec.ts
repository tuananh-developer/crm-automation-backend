import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EnrichmentController } from './enrichment.controller.js';
import type { LeadIntelligenceService } from './lead-intelligence.service.js';
import { EnrichmentStatus } from './enums/lead-intelligence.enum.js';
import type { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { JwtOrN8nAuthGuard } from '../../common/guards/jwt-or-n8n-auth.guard.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';

describe('EnrichmentController', () => {
  let controller: EnrichmentController;
  let service: jest.Mocked<Partial<LeadIntelligenceService>>;
  const actor: AuthenticatedUser = {
    id: 'user-owner-123',
    name: 'Sales Rep',
    email: 'sales@example.test',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockActor: AuthenticatedUser = {
    id: 'user-actor-456',
    name: 'Actor Rep',
    email: 'actor@example.test',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEnrichment: LeadEnrichment = {
    id: 'enrich-123',
    leadId: 'lead-123',
    workflowRunId: 'wf-run-123',
    provider: 'n8n',
    status: EnrichmentStatus.SUCCESS,
    companyName: 'Acme Corp',
    companyWebsite: 'https://acme.com',
    companyIndustry: 'Technology',
    companySize: 150,
    contactJobTitle: 'VP of Engineering',
    contactLinkedinUrl: 'https://linkedin.com/in/johndoe',
    rawResponse: { source: 'mock-provider', score: 0.95 },
    errorMessage: null,
    externalRequestId: 'ext-req-123',
    enrichedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as LeadEnrichment;

  beforeEach(() => {
    service = {
      triggerEnrichment: jest.fn().mockResolvedValue({
        workflowRunId: 'wf-run-123',
        status: 'PENDING',
        message: 'Enrichment triggered',
      }),
      handleEnrichmentCallback: jest.fn().mockResolvedValue({
        enrichment: mockEnrichment,
        workflowRunUpdated: true,
      }),
      getEnrichmentsByLead: jest.fn().mockResolvedValue([mockEnrichment]),
      getLatestEnrichment: jest.fn().mockResolvedValue(mockEnrichment),
      mockEnrichment: jest.fn().mockReturnValue({
        domain: 'acme.com',
        provider: 'mock',
        company: {
          name: 'Acme Solutions',
          website: 'https://acme.com',
          industry: 'Software',
          size: 250,
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
    const result = await controller.triggerEnrichment(
      'lead-123',
      { provider: 'clearbit' },
      actor,
    );

    expect(service.triggerEnrichment).toHaveBeenCalledWith(
      'lead-123',
      {
        provider: 'clearbit',
      },
      actor,
    );
    expect(result.workflowRunId).toBe('wf-run-123');
  });

  it('should pass authenticated actor when triggering enrichment', async () => {
    const dto = { provider: 'clearbit' };
    await controller.triggerEnrichment('lead-123', dto, mockActor);

    expect(service.triggerEnrichment).toHaveBeenCalledWith(
      'lead-123',
      dto,
      mockActor,
    );
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
    const result = await controller.getEnrichmentsByLead('lead-123', actor);

    expect(service.getEnrichmentsByLead).toHaveBeenCalledWith(
      'lead-123',
      actor,
    );
    expect(result).toHaveLength(1);
  });

  it('should get latest enrichment for a lead via service', async () => {
    const result = await controller.getLatestEnrichment('lead-123', actor);

    expect(service.getLatestEnrichment).toHaveBeenCalledWith('lead-123', actor);
    expect(result?.id).toBe('enrich-123');
  });

  describe('Authorization and Route Metadata', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    it('should configure dual route paths for handleCallback endpoint', () => {
      const path = Reflect.getMetadata(
        'path',
        EnrichmentController.prototype.handleCallback,
      );
      expect(path).toEqual([
        'callback',
        '/internal/n8n/lead-enrichment/callback',
      ]);
    });

    it('should configure dual route paths for triggerEnrichment endpoint', () => {
      const path = Reflect.getMetadata(
        'path',
        EnrichmentController.prototype.triggerEnrichment,
      );
      expect(path).toEqual([':leadId/enrichments', 'trigger/:leadId']);
    });

    it('should protect triggerEnrichment endpoint with JwtAuthGuard metadata', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        EnrichmentController.prototype.triggerEnrichment,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });

    it('should protect mockEnrichment endpoint with JwtOrN8nAuthGuard metadata', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        EnrichmentController.prototype.mockEnrichment,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtOrN8nAuthGuard);
    });
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  describe('Mock Enrichment Service Authentication Flow (n8n Integration)', () => {
    let compositeGuard: JwtOrN8nAuthGuard;
    let n8nAuthGuard: N8nAuthGuard;
    let mockJwtAuthGuard: Partial<JwtAuthGuard>;
    const mockApiKey = 'n8n-service-secret-key-123';

    beforeEach(() => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'N8N_API_KEY') return mockApiKey;
          if (key === 'NODE_ENV') return 'test';
          return undefined;
        }),
      };
      n8nAuthGuard = new N8nAuthGuard(
        mockConfigService as unknown as ConfigService,
      );
      mockJwtAuthGuard = {
        canActivate: jest.fn().mockImplementation(() => {
          throw new UnauthorizedException('JWT token required');
        }),
      };
      compositeGuard = new JwtOrN8nAuthGuard(
        mockJwtAuthGuard as JwtAuthGuard,
        n8nAuthGuard,
      );
    });

    const createExecutionContext = (
      headers: Record<string, string>,
    ): ExecutionContext =>
      ({
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({ headers }),
        }),
      }) as unknown as ExecutionContext;

    it('successfully authenticates workflow request carrying only X-N8N-API-KEY (no user JWT) and returns mock data', async () => {
      const context = createExecutionContext({
        'x-n8n-api-key': mockApiKey,
      });

      const canActivate = await compositeGuard.canActivate(context);
      expect(canActivate).toBe(true);

      const response = controller.mockEnrichment(
        'innovatetech.io',
        'contact@innovatetech.io',
        'mock',
      );

      expect(service.mockEnrichment).toHaveBeenCalledWith({
        domain: 'innovatetech.io',
        email: 'contact@innovatetech.io',
        provider: 'mock',
        fail: undefined,
      });
      expect(response).toBeDefined();
      expect(response.company.name).toBe('Acme Solutions');
    });

    it('rejects workflow request without authentication credentials (401)', async () => {
      const context = createExecutionContext({});

      await expect(compositeGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects workflow request with invalid X-N8N-API-KEY (401)', async () => {
      const context = createExecutionContext({
        'x-n8n-api-key': 'invalid-secret-key',
      });

      await expect(compositeGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('successfully authenticates browser user carrying valid JWT Bearer token', async () => {
      (mockJwtAuthGuard.canActivate as jest.Mock).mockResolvedValue(true);
      const context = createExecutionContext({
        authorization: 'Bearer valid-user-jwt',
      });

      const canActivate = await compositeGuard.canActivate(context);
      expect(canActivate).toBe(true);

      const response = controller.mockEnrichment('acme.com');
      expect(response).toBeDefined();
    });
  });
});
