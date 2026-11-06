import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DataSource } from 'typeorm';

describe('LeadsController (e2e) - Integration & Concurrency Tests', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createdLeadId: string | null = null;
  let sourceId: string;
  let accessToken: string;
  const uniqueSuffix = Date.now();
  const testEmail = `lead.e2e.${uniqueSuffix}@acme-corp.com`;

  const api = {
    get: (path: string) =>
      request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`),
    post: (path: string) =>
      request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${accessToken}`),
  };

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

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Leads E2E Sales',
        email: `leads.e2e.${uniqueSuffix}@example.test`,
        password: 'E2eStrongPassword123!',
      });
    expect(registration.status).toBe(201);
    accessToken = registration.body.accessToken;

    // Lead-source creation is Admin-only; create an isolated fixture directly.
    const sources = await dataSource.query(
      `INSERT INTO lead_sources (name, description, is_active)
       VALUES ($1, $2, true)
       RETURNING id;`,
      [`Leads E2E Source ${uniqueSuffix}`, 'Source created by the E2E database fixture'],
    );
    sourceId = sources[0].id;
  });

  afterAll(async () => {
    if (sourceId) {
      const rows = await dataSource.query(
        'SELECT id, converted_customer_id FROM leads WHERE source_id = $1;',
        [sourceId],
      );
      const leadIds = rows.map((row) => row.id);
      const customerIds = [
        ...new Set(
          rows.flatMap((row) =>
            row.converted_customer_id ? [row.converted_customer_id] : [],
          ),
        ),
      ];

      if (leadIds.length > 0) {
        await dataSource.query(
          "DELETE FROM audit_logs WHERE entity_type = 'Lead' AND entity_id = ANY($1::uuid[]);",
          [leadIds],
        );
      }
      if (customerIds.length > 0) {
        await dataSource.query(
          "DELETE FROM audit_logs WHERE entity_type = 'Customer' AND entity_id = ANY($1::uuid[]);",
          [customerIds],
        );
      }
      await dataSource.query('DELETE FROM leads WHERE source_id = $1;', [
        sourceId,
      ]);
      if (customerIds.length > 0) {
        await dataSource.query('DELETE FROM customers WHERE id = ANY($1::uuid[]);', [
          customerIds,
        ]);
      }
      await dataSource.query('DELETE FROM lead_sources WHERE id = $1;', [
        sourceId,
      ]);
    }
    await app.close();
  });

  it('1. should reject invalid body with 400 Bad Request', async () => {
    const res = await api.post('/api/v1/leads').send({
      firstName: 'John',
      // missing email and sourceId
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  it('2. should create a new Lead with 201 Created and status NEW', async () => {
    const res = await api.post('/api/v1/leads').send({
      firstName: 'Alexander',
      lastName: 'Hamilton',
      email: testEmail,
      companyName: 'Treasury Corp',
      jobTitle: 'CFO',
      companySize: 200,
      industry: 'Finance',
      sourceId,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe(testEmail.toLowerCase());
    expect(res.body.status).toBe('NEW');
    createdLeadId = res.body.id;
  });

  it('3. should reject duplicate email with 409 Conflict (anti-race condition / unique check)', async () => {
    const res = await api.post('/api/v1/leads').send({
      firstName: 'Alexander Duplicate',
      lastName: 'Hamilton',
      email: testEmail, // duplicate email
      sourceId,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already exists');
  });

  it('4. should retrieve the created lead via GET /api/v1/leads/:id', async () => {
    const res = await api
      .get(`/api/v1/leads/${createdLeadId}`)
      .expect(200);

    expect(res.body.id).toBe(createdLeadId);
    expect(res.body.email).toBe(testEmail.toLowerCase());
  });

  it('5. should enforce Rate Limiting (429 Too Many Requests) on rapid lead submissions', async () => {
    const statuses: number[] = [];

    // Send repeated requests sequentially to reach the 10/min threshold
    for (let i = 0; i < 12; i++) {
      const res = await api
        .post('/api/v1/leads')
        .send({
          firstName: 'Spam',
          lastName: `Bot${i}`,
          email: `spam.bot.${i}.${uniqueSuffix}@test.com`,
          sourceId,
        });
      statuses.push(res.status);
    }

    // At least one request beyond the limit (10/min) must receive 429
    expect(statuses).toContain(429);
  });

  it('6. should serialize concurrent conversions and write one Customer and one AuditLog', async () => {
    if (!createdLeadId) {
      throw new Error('The Lead fixture must be created before conversion');
    }

    await dataSource.query(
      "UPDATE leads SET status = 'QUALIFIED' WHERE id = $1;",
      [createdLeadId],
    );

    const responses = await Promise.all([
      api.post(`/api/v1/leads/${createdLeadId}/convert`).send({}),
      api.post(`/api/v1/leads/${createdLeadId}/convert`).send({}),
    ]);

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);

    const [lead] = await dataSource.query(
      'SELECT status, converted_customer_id FROM leads WHERE id = $1;',
      [createdLeadId],
    );
    expect(lead.status).toBe('CONVERTED');
    expect(lead.converted_customer_id).toBeTruthy();

    const [customerCount] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM customers WHERE LOWER(email) = LOWER($1);',
      [testEmail],
    );
    expect(Number(customerCount.count)).toBe(1);

    const [auditCount] = await dataSource.query(
      "SELECT COUNT(*)::int AS count FROM audit_logs WHERE entity_type = 'Lead' AND entity_id = $1 AND action = 'LEAD_CONVERTED';",
      [createdLeadId],
    );
    expect(Number(auditCount.count)).toBe(1);
  });
});
