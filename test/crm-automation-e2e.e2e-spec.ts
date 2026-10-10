import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DataSource } from 'typeorm';

describe('End-to-End CRM Automation Integration (UC01-UC09)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  // Shared state across the 9 use cases
  let testUserId: string;
  let sourceId: string;
  let leadId: string;
  let customerId: string;
  let sequenceId: string;
  let stepId: string;
  let enrollmentId: string;
  let reviewTaskId: string;
  let segmentId: string;

  const N8N_KEY = 'e2e-test-n8n-secret-key';
  const timestamp = Date.now();
  const testEmail = `enterprise.lead.${timestamp}@innovate-tech.io`;

  beforeAll(async () => {
    process.env.N8N_API_KEY = N8N_KEY;
    process.env.N8N_WEBHOOK_SECRET = N8N_KEY;

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

    // Get an active sales user from seeded data
    const users = await dataSource.query(
      `SELECT id FROM users WHERE role = 'SALES' AND status = 'ACTIVE' LIMIT 1;`,
    );
    testUserId = users[0]?.id;

    // Get or create lead source
    const sources = await dataSource.query(
      `SELECT id FROM lead_sources WHERE is_active = true LIMIT 1;`,
    );
    sourceId = sources[0]?.id;
  });

  afterAll(async () => {
    // Clean up created test entities in reverse order
    try {
      if (segmentId) {
        await dataSource.query(
          `DELETE FROM customer_segments WHERE segment_id = $1;`,
          [segmentId],
        );
        await dataSource.query(`DELETE FROM segments WHERE id = $1;`, [
          segmentId,
        ]);
      }
      if (enrollmentId) {
        await dataSource.query(
          `DELETE FROM follow_up_executions WHERE enrollment_id = $1;`,
          [enrollmentId],
        );
        await dataSource.query(
          `DELETE FROM lead_follow_up_enrollments WHERE id = $1;`,
          [enrollmentId],
        );
      }
      if (sequenceId) {
        await dataSource.query(
          `DELETE FROM follow_up_steps WHERE sequence_id = $1;`,
          [sequenceId],
        );
        await dataSource.query(
          `DELETE FROM follow_up_sequences WHERE id = $1;`,
          [sequenceId],
        );
      }
      if (reviewTaskId) {
        await dataSource.query(`DELETE FROM review_tasks WHERE id = $1;`, [
          reviewTaskId,
        ]);
      }
      if (leadId) {
        await dataSource.query(
          `DELETE FROM lead_qualifications WHERE lead_id = $1;`,
          [leadId],
        );
        await dataSource.query(
          `DELETE FROM lead_enrichments WHERE lead_id = $1;`,
          [leadId],
        );
        await dataSource.query(`DELETE FROM lead_scores WHERE lead_id = $1;`, [
          leadId,
        ]);
        await dataSource.query(`DELETE FROM audit_logs WHERE entity_id = $1;`, [
          leadId,
        ]);
        await dataSource.query(`DELETE FROM leads WHERE id = $1;`, [leadId]);
      }
      if (customerId) {
        await dataSource.query(`DELETE FROM audit_logs WHERE entity_id = $1;`, [
          customerId,
        ]);
        await dataSource.query(`DELETE FROM customers WHERE id = $1;`, [
          customerId,
        ]);
      }
    } catch {
      // Ignore cleanup error
    }

    await app.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC01: Create Lead
  // ─────────────────────────────────────────────────────────────────────────
  it('UC01: should create a new Lead via POST /api/v1/leads', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/leads').send({
      firstName: 'Katherine',
      lastName: 'Johnson',
      email: testEmail,
      phone: '+14155552671',
      companyName: 'InnovateTech Systems',
      companyWebsite: 'https://innovatetech.io',
      jobTitle: 'VP of Engineering',
      companySize: 250,
      industry: 'Technology',
      sourceId,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('NEW');
    leadId = res.body.id;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC02: AI Lead Qualification
  // ─────────────────────────────────────────────────────────────────────────
  it('UC02: should qualify Lead via POST /api/v1/lead-intelligence/qualification/callback', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/lead-intelligence/qualification/callback')
      .send({
        leadId,
        status: 'QUALIFIED',
        confidence: 0.96,
        intent: 'High purchase intent for enterprise platform',
        reason: 'Budget verified, enterprise decision maker.',
      });

    expect([200, 201]).toContain(res.status);

    // Verify lead status transitioned to QUALIFIED
    const check = await request(app.getHttpServer()).get(
      `/api/v1/leads/${leadId}`,
    );
    expect(check.status).toBe(200);
    expect(check.body.status).toBe('QUALIFIED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC03: AI Lead Enrichment
  // ─────────────────────────────────────────────────────────────────────────
  it('UC03: should enrich Lead profile via POST /api/v1/enrichment/callback', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/enrichment/callback')
      .set('x-n8n-api-key', N8N_KEY)
      .send({
        leadId,
        status: 'SUCCESS',
        provider: 'clearbit',
        companyName: 'InnovateTech Systems Global',
        companyWebsite: 'https://innovatetech.io',
        companyIndustry: 'Cloud Infrastructure',
        companySize: 300,
        contactJobTitle: 'VP of Engineering',
        contactLinkedinUrl: 'https://linkedin.com/in/kjohnson-tech',
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.enrichment.id).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC04: AI Lead Scoring
  // ─────────────────────────────────────────────────────────────────────────
  it('UC04: should calculate & record Lead score via POST /api/v1/scoring/callback', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/scoring/callback')
      .set('x-n8n-api-key', N8N_KEY)
      .send({
        leadId,
        status: 'SUCCESS',
        score: 92,
        label: 'HOT',
        reason:
          'Large company size, tech industry fit, verified decision maker.',
        modelProvider: 'Google Gemini',
        modelName: 'gemini-1.5-pro',
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.score.score).toBe(92);
    expect(res.body.score.label).toBe('HOT');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC05: Enroll Lead in Follow-up
  // ─────────────────────────────────────────────────────────────────────────
  it('UC05: should create Follow-up Sequence and enroll the qualified Lead', async () => {
    // 1. Create sequence
    const seqRes = await request(app.getHttpServer())
      .post('/api/v1/follow-up/sequences')
      .send({
        name: `Cadence E2E Integration ${timestamp}`,
        description: 'Automated outreach cadence for qualified leads',
        isActive: true,
        createdBy: testUserId,
      });

    expect([200, 201]).toContain(seqRes.status);
    sequenceId = seqRes.body.id;

    // 2. Add step to sequence
    const stepRes = await request(app.getHttpServer())
      .post(`/api/v1/follow-up/sequences/${sequenceId}/steps`)
      .send({
        stepOrder: 1,
        delayMinutes: 0,
        channel: 'EMAIL',
        actionType: 'SEND_EMAIL',
        subjectTemplate: 'Introduction for {{companyName}}',
        contentTemplate: 'Hello {{firstName}}, welcome to our platform.',
        isActive: true,
      });

    expect([200, 201]).toContain(stepRes.status);
    stepId = stepRes.body.id;

    // 3. Enroll lead
    const enrollRes = await request(app.getHttpServer())
      .post(`/api/v1/follow-up/sequences/${sequenceId}/enroll`)
      .send({
        leadId,
        assignedBy: testUserId,
      });

    expect([200, 201]).toContain(enrollRes.status);
    expect(enrollRes.body.enrollment).toBeDefined();
    expect(enrollRes.body.enrollment.status).toBe('ACTIVE');
    enrollmentId = enrollRes.body.enrollment.id;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC06: Execute Follow-up
  // ─────────────────────────────────────────────────────────────────────────
  it('UC06: should record Follow-up step execution via POST /api/v1/follow-ups/executions', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/follow-ups/executions')
      .send({
        enrollmentId,
        stepId,
      });

    expect([200, 201]).toContain(res.status);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC07: Human Review
  // ─────────────────────────────────────────────────────────────────────────
  it('UC07: should create, assign, and resolve a Human Review task', async () => {
    // 1. Create review task
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/review-tasks')
      .send({
        leadId,
        reason: 'High budget enterprise review required.',
      });

    expect([200, 201]).toContain(createRes.status);
    reviewTaskId = createRes.body.id;

    // 2. Assign reviewer
    const assignRes = await request(app.getHttpServer())
      .patch(`/api/v1/review-tasks/${reviewTaskId}/assign`)
      .send({
        reviewerId: testUserId,
      });

    expect([200, 201]).toContain(assignRes.status);

    // 3. Start review
    const startRes = await request(app.getHttpServer()).patch(
      `/api/v1/review-tasks/${reviewTaskId}/start`,
    );

    expect([200, 201]).toContain(startRes.status);
    expect(startRes.body.status).toBe('IN_REVIEW');

    // 4. Resolve review with APPROVE
    const resolveRes = await request(app.getHttpServer())
      .patch(`/api/v1/review-tasks/${reviewTaskId}/resolve`)
      .send({
        decision: 'APPROVE',
      });

    expect([200, 201]).toContain(resolveRes.status);
    expect(resolveRes.body.status).toBe('RESOLVED');
    expect(resolveRes.body.decision).toBe('APPROVE');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC08: Convert Lead to Customer
  // ─────────────────────────────────────────────────────────────────────────
  it('UC08: should convert qualified Lead into Customer via POST /api/v1/leads/:id/convert', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/leads/${leadId}/convert`)
      .send({
        userId: testUserId,
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.customer.id).toBeDefined();
    customerId = res.body.customer.id;

    // Verify lead status updated to CONVERTED
    const leadCheck = await request(app.getHttpServer()).get(
      `/api/v1/leads/${leadId}`,
    );
    expect(leadCheck.body.status).toBe('CONVERTED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC09: Customer Segmentation
  // ─────────────────────────────────────────────────────────────────────────
  it('UC09: should create Segment and evaluate Customer assignment', async () => {
    // 1. Create segment
    const segRes = await request(app.getHttpServer())
      .post('/api/v1/segments')
      .send({
        createdBy: testUserId,
        name: `Enterprise VIP Segment ${timestamp}`,
        description: 'High ARR and verified enterprise customers',
        criteria: {
          logic: 'AND',
          assignmentType: 'RULE',
          conditions: [
            {
              id: 'cond-1',
              field: 'company_name',
              operator: 'contains',
              value: 'InnovateTech',
            },
          ],
        },
        isActive: true,
      });

    expect([200, 201]).toContain(segRes.status);
    segmentId = segRes.body.id;

    // 2. Evaluate customer into segment
    const evalRes = await request(app.getHttpServer())
      .post(`/api/v1/segments/${segmentId}/evaluate`)
      .send({
        customerId,
        assignmentType: 'RULE',
      });

    expect([200, 201]).toContain(evalRes.status);
    expect(evalRes.body.segmentId).toBe(segmentId);
    expect(evalRes.body.customerId).toBe(customerId);
    expect(evalRes.body.status).toBe('COMPLETED');
  });
});
