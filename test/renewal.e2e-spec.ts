import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DataSource } from 'typeorm';

describe('Renewal Management Module (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let customerId: string;
  let contractId: string;
  let draftId: string;
  const uniqueSuffix = Date.now();
  const n8nApiKey = process.env.N8N_API_KEY || 'test-key-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);

    // Register user for Bearer JWT token
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Renewal E2E User',
        email: `renewal.e2e.${uniqueSuffix}@example.test`,
        password: 'E2eStrongPassword123!',
      });
    expect(registration.status).toBe(201);
    accessToken = registration.body.accessToken;

    // Create a real customer in PostgreSQL
    const custInsert = await dataSource.query(`
      INSERT INTO "customers" ("name", "email", "company_name", "status", "created_by")
      VALUES ('Renewal Customer Acme', 'acme.${uniqueSuffix}@example.test', 'Acme Corp', 'ACTIVE', '${registration.body.user.id}')
      RETURNING "id"
    `);
    customerId = custInsert[0].id;
  });

  afterAll(async () => {
    if (contractId) {
      await dataSource.query(
        `DELETE FROM "contracts" WHERE "id" = '${contractId}'`,
      );
    }
    if (customerId) {
      await dataSource.query(
        `DELETE FROM "customers" WHERE "id" = '${customerId}'`,
      );
    }
    await app.close();
  });

  describe('Contract Management', () => {
    it('creates a new customer contract via POST /api/v1/customer-contracts', async () => {
      const renewalDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/api/v1/customer-contracts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          customerId,
          contractNumber: `CTR-E2E-${uniqueSuffix}`,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          renewalDate,
          amount: 50000,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.contractNumber).toBe(`CTR-E2E-${uniqueSuffix}`);
      contractId = res.body.id;
    });

    it('rejects contract creation referencing non-existent customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customer-contracts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          customerId: '00000000-0000-4000-8000-000000000000',
          contractNumber: `CTR-INVALID-${uniqueSuffix}`,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

      expect(res.status).toBe(404);
    });

    it('lists contracts via GET /api/v1/customer-contracts', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-contracts?customerId=${customerId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((c: { id: string }) => c.id === contractId)).toBe(true);
    });

    it('retrieves contract by ID via GET /api/v1/customer-contracts/:contractId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/customer-contracts/${contractId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(contractId);
    });

    it('finds contracts due for renewal via GET /api/v1/customer-contracts/due-for-renewal', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customer-contracts/due-for-renewal?days=30')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((c: { id: string }) => c.id === contractId)).toBe(true);
    });
  });

  describe('n8n Internal Workflow Integration', () => {
    it('retrieves due contracts via GET /api/v1/internal/n8n/renewal/contracts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/internal/n8n/renewal/contracts?days=30')
        .set('X-N8N-API-KEY', n8nApiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((c: { id: string }) => c.id === contractId)).toBe(true);
    });

    it('computes renewal urgency via POST /api/v1/internal/n8n/renewal/urgency', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/renewal/urgency')
        .set('X-N8N-API-KEY', n8nApiKey)
        .send({
          renewalDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe('CRITICAL');
      expect(res.body.daysRemaining).toBeLessThanOrEqual(5);
    });

    it('validates renewal draft payload via POST /api/v1/internal/n8n/renewal/validate-draft', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/renewal/validate-draft')
        .set('X-N8N-API-KEY', n8nApiKey)
        .send({
          contractId,
          customerId,
          renewalDate: new Date().toISOString(),
          sourceContractId: contractId,
          sourceCustomerId: customerId,
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.contractMatch).toBe(true);
      expect(res.body.customerMatch).toBe(true);
    });

    it('creates a renewal draft idempotently via POST /api/v1/internal/n8n/renewal/drafts', async () => {
      const idempotencyKey = `idemp-renewal-${uniqueSuffix}`;
      const payload = {
        contractId,
        customerId,
        renewalDate: new Date().toISOString(),
        urgency: 'HIGH',
        recommendation: 'Renew with 5% discount',
        draftContent: 'Proposal draft content',
        idempotencyKey,
        validationResult: {
          grounded: true,
          consentGranted: false,
          templateApproved: false,
          policyApproved: false,
        },
      };

      // Call 1: creates draft
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/renewal/drafts')
        .set('X-N8N-API-KEY', n8nApiKey)
        .send(payload);

      expect(res1.status).toBe(201);
      expect(res1.body.id).toBeDefined();
      draftId = res1.body.id;

      // Call 2 with same idempotency key: returns existing draft
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/renewal/drafts')
        .set('X-N8N-API-KEY', n8nApiKey)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.body.id).toBe(draftId);
    });

    it('SECURITY: Fail-Closed checkEligibility rejects caller-supplied booleans when backend records lack consent', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/renewal/check-eligibility')
        .set('X-N8N-API-KEY', n8nApiKey)
        .send({
          contractId,
          customerId,
          draftId,
          hasConsent: true, // Caller lie
          hasTemplate: true,
          policyAllows: true,
          needsApproval: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.canAutoSend).toBe(false);
      expect(res.body.reason).toBe('FAIL_CLOSED: no backend consent record');
    });

    it('SECURITY: Allows auto-send only when authoritative backend metadata satisfies all gates', async () => {
      // Simulate backend approval workflow updating the draft metadata in database
      await dataSource.query(`
        UPDATE "renewal_drafts"
        SET "status" = 'APPROVED',
            "validation_result" = '{"grounded":true,"consentGranted":true,"templateApproved":true,"policyApproved":true,"approvedBy":"admin-system"}'
        WHERE "id" = '${draftId}'
      `);

      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/renewal/check-eligibility')
        .set('X-N8N-API-KEY', n8nApiKey)
        .send({
          contractId,
          customerId,
          draftId,
        });

      expect(res.status).toBe(200);
      expect(res.body.canAutoSend).toBe(true);
      expect(res.body.reason).toBe('OK');
    });

    it('records renewal attempt outcome idempotently via POST /api/v1/internal/n8n/renewal/record-attempt', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/renewal/record-attempt')
        .set('X-N8N-API-KEY', n8nApiKey)
        .send({
          contractId,
          customerId,
          status: 'SENT',
          idempotencyKey: `attempt-outcome-${uniqueSuffix}`,
          communicationId: `comm-delivery-${uniqueSuffix}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SENT');
      expect(res.body.communicationId).toBe(`comm-delivery-${uniqueSuffix}`);
    });
  });
});
