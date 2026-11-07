import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { CustomersController } from '../src/modules/customers/customers.controller.js';
import { CustomersService } from '../src/modules/customers/customers.service.js';
import { InternalWorkflowExecutionClaimsController } from '../src/modules/t12-workflows/internal-workflow-execution-claims.controller.js';
import { WorkflowExecutionClaimsService } from '../src/modules/t12-workflows/workflow-execution-claims.service.js';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard.js';
import { JwtOrN8nAuthGuard } from '../src/common/guards/jwt-or-n8n-auth.guard.js';
import { N8nAuthGuard } from '../src/modules/lead-intelligence/guards/n8n-auth.guard.js';
import { Customer360ResponseDto } from '../src/modules/customers/dto/customer-360-response.dto.js';

describe('Customer 360 Service-Key Authentication (E2E)', () => {
  let app: INestApplication<App>;
  let customersServiceMock: jest.Mocked<Partial<CustomersService>>;
  let claimsServiceMock: jest.Mocked<Partial<WorkflowExecutionClaimsService>>;

  const N8N_KEY = 'test-n8n-service-key-wf05';
  const VALID_CUSTOMER_ID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

  const mockCustomer360Data = {
    customer: {
      id: VALID_CUSTOMER_ID,
      name: 'Acme Corporation',
      email: 'contact@acme.com',
      companyName: 'Acme Corp',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    convertedLeads: [],
    interactions: [],
    leadIntelligence: {
      qualifications: [],
      enrichments: [],
      scores: [],
    },
    followUps: {
      enrollments: [],
      executions: [],
    },
    segments: [],
    sourceCoverage: {
      crmProfile: 'AVAILABLE',
      interactions: 'EMPTY',
      leadIntelligence: 'EMPTY',
      followUps: 'EMPTY',
      segments: 'EMPTY',
      customerIssues: 'NOT_CONNECTED',
      customerFeedback: 'NOT_CONNECTED',
    },
    aiSummary: null,
    latestWorkflowRun: null,
  };

  beforeAll(async () => {
    customersServiceMock = {
      getCustomer360: jest.fn().mockImplementation((id) => {
        return Promise.resolve({
          ...mockCustomer360Data,
          customer: {
            ...mockCustomer360Data.customer,
            id,
          },
        } as unknown as Customer360ResponseDto);
      }),
      getCustomerInteractions: jest.fn().mockResolvedValue([]),
      getCustomerIntelligence: jest.fn().mockResolvedValue({
        qualifications: [],
        enrichments: [],
        scores: [],
      }),
      getCustomerFollowUps: jest.fn().mockResolvedValue({
        enrollments: [],
        executions: [],
      }),
      getCustomerSegments: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: VALID_CUSTOMER_ID }),
      triggerCustomer360: jest.fn().mockResolvedValue({
        message: 'Triggered',
        workflowRunId: 'run-1',
      }),
      handleCustomer360Callback: jest.fn().mockResolvedValue({
        success: true,
        customerId: VALID_CUSTOMER_ID,
        workflowRunId: 'run-1',
      }),
    };

    claimsServiceMock = {
      claim: jest.fn().mockResolvedValue({
        claimed: true,
        duplicate: false,
        status: 'RUNNING',
      }),
    };

    const configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'N8N_API_KEY' || key === 'N8N_WEBHOOK_SECRET') {
          return N8N_KEY;
        }
        if (key === 'NODE_ENV') {
          return 'test';
        }
        return undefined;
      }),
    };

    // Concrete mock of JwtAuthGuard that verifies standard Bearer token behavior
    const mockJwtAuthGuard = {
      canActivate: jest.fn((context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        const auth = req.headers?.authorization;
        if (
          auth &&
          auth.startsWith('Bearer ') &&
          auth !== `Bearer ${N8N_KEY}`
        ) {
          // Valid user JWT simulation
          req.user = {
            id: 'user-jwt-1',
            role: 'ADMIN',
            email: 'admin@acme.com',
          };
          return true;
        }
        throw new UnauthorizedException(
          'Unauthorized: missing or invalid authentication token',
        );
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        CustomersController,
        InternalWorkflowExecutionClaimsController,
      ],
      providers: [
        {
          provide: CustomersService,
          useValue: customersServiceMock,
        },
        {
          provide: WorkflowExecutionClaimsService,
          useValue: claimsServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        Reflector,
        N8nAuthGuard,
        {
          provide: JwtAuthGuard,
          useValue: mockJwtAuthGuard,
        },
        JwtOrN8nAuthGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Service-Key Authentication Tests for GET /customers/:id/360
  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /customers/:id/360 with n8n Service Key', () => {
    it('successfully returns Customer 360 data when called with only X-N8N-API-KEY header', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${VALID_CUSTOMER_ID}/360`)
        .set('x-n8n-api-key', N8N_KEY);

      expect(res.status).toBe(200);
      expect(res.body.customer.id).toBe(VALID_CUSTOMER_ID);
      expect(res.body.sourceCoverage).toBeDefined();

      // Verify service called with null user (internal service execution via @CurrentUser)
      expect(customersServiceMock.getCustomer360).toHaveBeenCalledWith(
        VALID_CUSTOMER_ID,
        null,
      );
    });

    it('successfully returns Customer 360 data when called with X-API-KEY alias header', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${VALID_CUSTOMER_ID}/360`)
        .set('x-api-key', N8N_KEY);

      expect(res.status).toBe(200);
      expect(res.body.customer.id).toBe(VALID_CUSTOMER_ID);
      expect(customersServiceMock.getCustomer360).toHaveBeenCalledWith(
        VALID_CUSTOMER_ID,
        null,
      );
    });

    it('successfully returns Customer 360 data when called with Authorization: Bearer <service_key>', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${VALID_CUSTOMER_ID}/360`)
        .set('Authorization', `Bearer ${N8N_KEY}`);

      expect(res.status).toBe(200);
      expect(res.body.customer.id).toBe(VALID_CUSTOMER_ID);
      expect(customersServiceMock.getCustomer360).toHaveBeenCalledWith(
        VALID_CUSTOMER_ID,
        null,
      );
    });

    it('rejects with 401 when called with invalid n8n service key', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${VALID_CUSTOMER_ID}/360`)
        .set('x-n8n-api-key', 'invalid-wrong-key');

      expect(res.status).toBe(401);
      expect(customersServiceMock.getCustomer360).not.toHaveBeenCalled();
    });

    it('rejects with 401 when called with no authentication headers', async () => {
      const res = await request(app.getHttpServer()).get(
        `/customers/${VALID_CUSTOMER_ID}/360`,
      );

      expect(res.status).toBe(401);
      expect(customersServiceMock.getCustomer360).not.toHaveBeenCalled();
    });

    it('successfully returns Customer 360 data when called with valid user JWT Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${VALID_CUSTOMER_ID}/360`)
        .set('Authorization', 'Bearer valid-user-jwt-token');

      expect(res.status).toBe(200);
      expect(customersServiceMock.getCustomer360).toHaveBeenCalledWith(
        VALID_CUSTOMER_ID,
        expect.objectContaining({ id: 'user-jwt-1', role: 'ADMIN' }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Verification that other hybrid routes allow service-key access
  // ───────────────────────────────────────────────────────────────────────────
  describe('Customer Profile and 360 sub-resources with n8n Service Key', () => {
    it('GET /customers/:id succeeds with only X-N8N-API-KEY (for n8n profile read)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${VALID_CUSTOMER_ID}`)
        .set('x-n8n-api-key', N8N_KEY);

      expect(res.status).toBe(200);
      expect(customersServiceMock.findOne).toHaveBeenCalledWith(
        VALID_CUSTOMER_ID,
        null,
      );
    });

    it('GET /customers/:id/internal succeeds with only X-N8N-API-KEY (internal alias)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${VALID_CUSTOMER_ID}/internal`)
        .set('x-n8n-api-key', N8N_KEY);

      expect(res.status).toBe(200);
      expect(customersServiceMock.findOne).toHaveBeenCalledWith(
        VALID_CUSTOMER_ID,
        null,
      );
    });

    it.each([
      ['interactions', 'getCustomerInteractions'],
      ['intelligence', 'getCustomerIntelligence'],
      ['follow-ups', 'getCustomerFollowUps'],
      ['segments', 'getCustomerSegments'],
    ])(
      'GET /customers/:id/%s succeeds with only X-N8N-API-KEY',
      async (path, method) => {
        const res = await request(app.getHttpServer())
          .get(`/customers/${VALID_CUSTOMER_ID}/${path}`)
          .set('x-n8n-api-key', N8N_KEY);

        expect(res.status).toBe(200);
        expect(
          (customersServiceMock as Record<string, any>)[method],
        ).toHaveBeenCalledWith(VALID_CUSTOMER_ID, null);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Verification that browser-only routes still strictly enforce JwtAuthGuard
  // ───────────────────────────────────────────────────────────────────────────
  describe('Browser-only routes require JWT and reject n8n Service Key', () => {
    it('rejects GET /customers when called with only X-N8N-API-KEY (requires JWT)', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('x-n8n-api-key', N8N_KEY);

      expect(res.status).toBe(401);
      expect(customersServiceMock.findAll).not.toHaveBeenCalled();
    });

    it('rejects POST /customers/:id/360/trigger when called with only X-N8N-API-KEY (requires JWT user)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/customers/${VALID_CUSTOMER_ID}/360/trigger`)
        .set('x-n8n-api-key', N8N_KEY);

      expect(res.status).toBe(401);
      expect(customersServiceMock.triggerCustomer360).not.toHaveBeenCalled();
    });

    it('allows POST /customers/:id/360/trigger with valid user JWT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/customers/${VALID_CUSTOMER_ID}/360/trigger`)
        .set('Authorization', 'Bearer valid-user-jwt-token');

      expect(res.status).toBe(202);
      expect(customersServiceMock.triggerCustomer360).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Service callback route enforcement
  // ───────────────────────────────────────────────────────────────────────────
  describe('POST /customers/:id/360/callback', () => {
    it('accepts callback when authenticated with X-N8N-API-KEY', async () => {
      const res = await request(app.getHttpServer())
        .post(`/customers/${VALID_CUSTOMER_ID}/360/callback`)
        .set('x-n8n-api-key', N8N_KEY)
        .send({
          workflowRunId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          customerId: VALID_CUSTOMER_ID,
          status: 'SUCCESS',
          summary: 'Executive summary from AI',
        });

      expect(res.status).toBe(200);
      expect(customersServiceMock.handleCustomer360Callback).toHaveBeenCalled();
    });

    it('rejects callback with 401 when called without n8n service key', async () => {
      const res = await request(app.getHttpServer())
        .post(`/customers/${VALID_CUSTOMER_ID}/360/callback`)
        .send({
          workflowRunId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          customerId: VALID_CUSTOMER_ID,
          status: 'SUCCESS',
        });

      expect(res.status).toBe(401);
      expect(
        customersServiceMock.handleCustomer360Callback,
      ).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Service execution claim route enforcement (WF05 Deduplication)
  // ───────────────────────────────────────────────────────────────────────────
  describe('POST /internal/n8n/workflow-executions/claim (WF05 Deduplication)', () => {
    const claimDto = {
      workflowRunId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      workflowName: 't12-wf05-customer-360',
      n8nExecutionId: 'exec-n8n-wf05-001',
    };

    it('accepts claim for t12-wf05-customer-360 when authenticated with X-N8N-API-KEY', async () => {
      const res = await request(app.getHttpServer())
        .post('/internal/n8n/workflow-executions/claim')
        .set('x-n8n-api-key', N8N_KEY)
        .send(claimDto);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        claimed: true,
        duplicate: false,
        status: 'RUNNING',
      });
      expect(claimsServiceMock.claim).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowRunId: claimDto.workflowRunId,
          workflowName: 't12-wf05-customer-360',
          n8nExecutionId: claimDto.n8nExecutionId,
        }),
      );
    });

    it('handles duplicate execution claim rejection (lost-ack replay)', async () => {
      (claimsServiceMock.claim as jest.Mock).mockResolvedValueOnce({
        claimed: false,
        duplicate: false,
        reason: 'ALREADY_CLAIMED',
        status: 'RUNNING',
      });

      const res = await request(app.getHttpServer())
        .post('/internal/n8n/workflow-executions/claim')
        .set('x-n8n-api-key', N8N_KEY)
        .send({
          ...claimDto,
          n8nExecutionId: 'exec-n8n-wf05-lost-ack-retry',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        claimed: false,
        duplicate: false,
        reason: 'ALREADY_CLAIMED',
        status: 'RUNNING',
      });
    });

    it('rejects claim with 401 when called without n8n service key', async () => {
      const res = await request(app.getHttpServer())
        .post('/internal/n8n/workflow-executions/claim')
        .send(claimDto);

      expect(res.status).toBe(401);
      expect(claimsServiceMock.claim).not.toHaveBeenCalled();
    });

    it('rejects claim with 401 when called with invalid n8n service key', async () => {
      const res = await request(app.getHttpServer())
        .post('/internal/n8n/workflow-executions/claim')
        .set('x-n8n-api-key', 'wrong-invalid-secret-key')
        .send(claimDto);

      expect(res.status).toBe(401);
      expect(claimsServiceMock.claim).not.toHaveBeenCalled();
    });
  });
});
