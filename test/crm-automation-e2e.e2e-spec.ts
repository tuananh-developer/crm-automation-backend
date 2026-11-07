import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { N8nClientService } from '../src/infrastructure/n8n/n8n-client.service.js';
import { DataSource } from 'typeorm';

describe('End-to-End CRM Automation Integration (UC01-UC09)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  // Shared state across the 9 use cases
  let testUserId: string;
  let accessToken: string;
  let sourceId: string;
  let leadId: string;
  let customerId: string;
  let sequenceId: string;
  let stepId: string;
  let secondStepId: string;
  let thirdStepId: string;
  let fourthStepId: string;
  let enrollmentId: string;
  let reviewTaskId: string;
  let segmentId: string;

  const N8N_KEY = 'e2e-test-n8n-secret-key';
  const n8nTriggerWebhook = jest.fn().mockResolvedValue({
    success: true,
    providerMessageId: 'e2e-provider-message-id',
    message: 'Mock n8n accepted follow-up',
  });
  const timestamp = Date.now();
  const testEmail = `enterprise.lead.${timestamp}@innovate-tech.io`;

  const api = {
    get: (path: string) =>
      request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`),
    post: (path: string) =>
      request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${accessToken}`),
    patch: (path: string) =>
      request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${accessToken}`),
  };

  beforeAll(async () => {
    process.env.N8N_API_KEY = N8N_KEY;
    process.env.N8N_WEBHOOK_SECRET = N8N_KEY;
    process.env.N8N_FOLLOW_UP_WEBHOOK_PATH = 'follow-up-execute';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(N8nClientService)
      .useValue({ triggerWebhook: n8nTriggerWebhook })
      .compile();

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
        name: 'CRM E2E Sales',
        email: `crm.e2e.${timestamp}@example.test`,
        password: 'E2eStrongPassword123!',
      });
    expect(registration.status).toBe(201);
    accessToken = registration.body.accessToken;
    testUserId = registration.body.user.id;

    const sources = await dataSource.query(
      `INSERT INTO lead_sources (name, description, is_active)
       VALUES ($1, $2, true)
       RETURNING id;`,
      [`CRM E2E Source ${timestamp}`, 'Source created by the E2E database fixture'],
    );
    sourceId = sources[0].id;
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
    const res = await api.post('/api/v1/leads').send({
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
    const trigger = await api
      .post(`/api/v1/lead-intelligence/qualify/${leadId}`)
      .send({});
    expect(trigger.status).toBe(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/internal/n8n/lead-qualification/callback')
      .set('x-n8n-api-key', N8N_KEY)
      .send({
        leadId,
        workflowRunId: trigger.body.workflowRunId,
        status: 'QUALIFIED',
        confidence: 0.96,
        intent: 'High purchase intent for enterprise platform',
        reason: 'Budget verified, enterprise decision maker.',
      });

    expect([200, 201]).toContain(res.status);

    // Verify lead status transitioned to QUALIFIED
    const check = await api.get(
      `/api/v1/leads/${leadId}`,
    );
    expect(check.status).toBe(200);
    expect(check.body.status).toBe('QUALIFIED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC03: AI Lead Enrichment
  // ─────────────────────────────────────────────────────────────────────────
  it('UC03: should enrich Lead profile via POST /api/v1/enrichment/callback', async () => {
    const trigger = await api
      .post(`/api/v1/lead-intelligence/enrich/${leadId}`)
      .send({ provider: 'mock' });
    expect(trigger.status).toBe(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/internal/n8n/lead-enrichment/callback')
      .set('x-n8n-api-key', N8N_KEY)
      .send({
        leadId,
        workflowRunId: trigger.body.workflowRunId,
        status: 'SUCCESS',
        provider: 'mock',
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
    const trigger = await api
      .post(`/api/v1/scoring/score/${leadId}`)
      .send({});
    expect(trigger.status).toBe(202);

    const res = await request(app.getHttpServer())
      .post('/api/v1/internal/n8n/lead-scoring/callback')
      .set('x-n8n-api-key', N8N_KEY)
      .send({
        leadId,
        workflowRunId: trigger.body.workflowRunId,
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
    const seqRes = await api
      .post('/api/v1/follow-up/sequences')
      .send({
        name: `Cadence E2E Integration ${timestamp}`,
        description: 'Automated outreach cadence for qualified leads',
        isActive: true,
      });

    expect([200, 201]).toContain(seqRes.status);
    sequenceId = seqRes.body.id;

    // 2. Add step to sequence
    const stepRes = await api
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

    // Additional steps let UC06 exercise pause/cancel races across progression.
    const secondStepRes = await api
      .post(`/api/v1/follow-up/sequences/${sequenceId}/steps`)
      .send({
        stepOrder: 2,
        delayMinutes: 0,
        channel: 'EMAIL',
        actionType: 'SEND_EMAIL',
        subjectTemplate: 'Follow-up step 2 for {{companyName}}',
        contentTemplate: 'Second follow-up for {{firstName}}.',
        isActive: true,
      });
    expect([200, 201]).toContain(secondStepRes.status);
    secondStepId = secondStepRes.body.id;

    const thirdStepRes = await api
      .post(`/api/v1/follow-up/sequences/${sequenceId}/steps`)
      .send({
        stepOrder: 3,
        delayMinutes: 0,
        channel: 'EMAIL',
        actionType: 'SEND_EMAIL',
        subjectTemplate: 'Follow-up step 3 for {{companyName}}',
        contentTemplate: 'Third follow-up for {{firstName}}.',
        isActive: true,
      });
    expect([200, 201]).toContain(thirdStepRes.status);
    thirdStepId = thirdStepRes.body.id;

    const fourthStepRes = await api
      .post(`/api/v1/follow-up/sequences/${sequenceId}/steps`)
      .send({
        stepOrder: 4,
        delayMinutes: 0,
        channel: 'EMAIL',
        actionType: 'SEND_EMAIL',
        subjectTemplate: 'Follow-up step 4 for {{companyName}}',
        contentTemplate: 'Fourth follow-up for {{firstName}}.',
        isActive: true,
      });
    expect([200, 201]).toContain(fourthStepRes.status);
    fourthStepId = fourthStepRes.body.id;

    // 3. Enroll lead
    const enrollRes = await api
      .post(`/api/v1/follow-up/sequences/${sequenceId}/enroll`)
      .send({
        leadId,
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
    n8nTriggerWebhook.mockClear();

    const res = await api
      .post('/api/v1/follow-ups/executions')
      .send({
        enrollmentId,
        stepId,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCESS');
    expect(n8nTriggerWebhook).toHaveBeenCalledTimes(1);
    expect(n8nTriggerWebhook).toHaveBeenCalledWith(
      'follow-up-execute',
      expect.objectContaining({
        enrollmentId,
        stepId,
        leadId,
      }),
    );

    const [execution] = await dataSource.query(
      `SELECT status, provider_message_id, response_payload
       FROM follow_up_executions
       WHERE enrollment_id = $1 AND step_id = $2
       ORDER BY created_at DESC
       LIMIT 1;`,
      [enrollmentId, stepId],
    );

    expect(execution.status).toBe('SUCCESS');
    expect(execution.provider_message_id).toBe('e2e-provider-message-id');
    expect(execution.response_payload).toEqual(
      expect.objectContaining({
        success: true,
        providerMessageId: 'e2e-provider-message-id',
      }),
    );
  });

  it('UC06: should preserve pause/cancel state when in-flight delivery returns', async () => {
    const holdNextDelivery = () => {
      let release!: (result: {
        success: true;
        providerMessageId: string;
        message: string;
      }) => void;
      let signalStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      n8nTriggerWebhook.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
            signalStarted();
          }),
      );
      return {
        started,
        complete: () =>
          release({
            success: true,
            providerMessageId: 'e2e-held-provider-message-id',
            message: 'Held delivery released by E2E test',
          }),
      };
    };

    // Step 1 succeeded in the previous UC06 test, so step 2 is pending.
    const pausedDelivery = holdNextDelivery();
    // Supertest requests are lazy until a then/catch/end handler is attached.
    // Start the HTTP call before waiting for the mocked provider to signal entry.
    const pausedRequest = api
      .post('/api/v1/follow-ups/executions')
      .send({ enrollmentId, stepId: secondStepId })
      .then((response) => response);

    await pausedDelivery.started;
    const pauseResponse = await api
      .post(`/api/v1/follow-ups/enrollments/${enrollmentId}/pause`)
      .send({ reason: 'E2E pause while provider is processing' });
    expect([200, 201]).toContain(pauseResponse.status);
    expect(pauseResponse.body.status).toBe('PAUSED');

    pausedDelivery.complete();
    const pausedExecutionResponse = await pausedRequest;
    expect(pausedExecutionResponse.status).toBe(200);
    expect(pausedExecutionResponse.body.status).toBe('SUCCESS');

    const [pausedState] = await dataSource.query(
      `SELECT status, current_step_id
       FROM lead_follow_up_enrollments
       WHERE id = $1;`,
      [enrollmentId],
    );
    expect(pausedState.status).toBe('PAUSED');
    expect(pausedState.current_step_id).toBe(thirdStepId);

    const [secondExecution] = await dataSource.query(
      `SELECT status FROM follow_up_executions
       WHERE enrollment_id = $1 AND step_id = $2
       ORDER BY created_at DESC LIMIT 1;`,
      [enrollmentId, secondStepId],
    );
    const [thirdExecution] = await dataSource.query(
      `SELECT status FROM follow_up_executions
       WHERE enrollment_id = $1 AND step_id = $2
       ORDER BY created_at DESC LIMIT 1;`,
      [enrollmentId, thirdStepId],
    );
    expect(secondExecution.status).toBe('SUCCESS');
    expect(thirdExecution.status).toBe('PENDING');

    const resumeResponse = await api
      .post(`/api/v1/follow-ups/enrollments/${enrollmentId}/resume`)
      .send({});
    expect([200, 201]).toContain(resumeResponse.status);
    expect(resumeResponse.body.status).toBe('ACTIVE');

    // Complete step 3 normally to make step 4 the next in-flight delivery.
    const thirdStepResponse = await api
      .post('/api/v1/follow-ups/executions')
      .send({ enrollmentId, stepId: thirdStepId });
    expect(thirdStepResponse.status).toBe(200);
    expect(thirdStepResponse.body.status).toBe('SUCCESS');

    const cancelledDelivery = holdNextDelivery();
    const cancelledRequest = api
      .post('/api/v1/follow-ups/executions')
      .send({ enrollmentId, stepId: fourthStepId })
      .then((response) => response);

    await cancelledDelivery.started;
    const cancelResponse = await api
      .post(`/api/v1/follow-ups/enrollments/${enrollmentId}/cancel`)
      .send({ reason: 'E2E cancellation while provider is processing' });
    expect([200, 201]).toContain(cancelResponse.status);
    expect(cancelResponse.body.status).toBe('CANCELLED');

    cancelledDelivery.complete();
    const cancelledExecutionResponse = await cancelledRequest;
    expect(cancelledExecutionResponse.status).toBe(200);
    expect(cancelledExecutionResponse.body.status).toBe('SUCCESS');

    const [cancelledState] = await dataSource.query(
      `SELECT status, current_step_id
       FROM lead_follow_up_enrollments
       WHERE id = $1;`,
      [enrollmentId],
    );
    expect(cancelledState.status).toBe('CANCELLED');
    expect(cancelledState.current_step_id).toBe(fourthStepId);

    const [fourthExecution] = await dataSource.query(
      `SELECT status FROM follow_up_executions
       WHERE enrollment_id = $1 AND step_id = $2
       ORDER BY created_at DESC LIMIT 1;`,
      [enrollmentId, fourthStepId],
    );
    expect(fourthExecution.status).toBe('SUCCESS');

    const [unexpectedNextStep] = await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM follow_up_executions
       WHERE enrollment_id = $1 AND step_id <> ALL($2::uuid[]);`,
      [enrollmentId, [stepId, secondStepId, thirdStepId, fourthStepId]],
    );
    expect(unexpectedNextStep.count).toBe(0);
  }, 15000);

  // ───────────────────────────────────────────────────────────────────────────
  // UC07: Human Review
  // ─────────────────────────────────────────────────────────────────────────
  it('UC07: should create, assign, and resolve a Human Review task', async () => {
    // 1. Create review task
    const createRes = await api
      .post('/api/v1/review-tasks')
      .send({
        leadId,
        reason: 'High budget enterprise review required.',
      });

    expect([200, 201]).toContain(createRes.status);
    reviewTaskId = createRes.body.id;

    // 2. Assign reviewer
    const assignRes = await api
      .patch(`/api/v1/review-tasks/${reviewTaskId}/assign`)
      .send({
        reviewerId: testUserId,
      });

    expect([200, 201]).toContain(assignRes.status);

    // 3. Start review
    const startRes = await api.patch(
      `/api/v1/review-tasks/${reviewTaskId}/start`,
    );

    expect([200, 201]).toContain(startRes.status);
    expect(startRes.body.status).toBe('IN_REVIEW');

    // 4. Resolve review with APPROVE
    const resolveRes = await api
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
    const res = await api
      .post(`/api/v1/leads/${leadId}/convert`)
      .send({});

    expect([200, 201]).toContain(res.status);
    expect(res.body.customer.id).toBeDefined();
    customerId = res.body.customer.id;

    // Verify lead status updated to CONVERTED
    const leadCheck = await api.get(
      `/api/v1/leads/${leadId}`,
    );
    expect(leadCheck.body.status).toBe('CONVERTED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T12-WF05: Customer 360 Aggregation with Service-Key Authentication
  // ─────────────────────────────────────────────────────────────────────────
  it('T12-WF05: should read Customer 360 view using only n8n service key (X-N8N-API-KEY)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/360`)
      .set('x-n8n-api-key', N8N_KEY);

    expect(res.status).toBe(200);
    expect(res.body.customer.id).toBe(customerId);
    expect(res.body.sourceCoverage).toBeDefined();
    expect(res.body.sourceCoverage.crmProfile).toBe('AVAILABLE');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // UC09: Customer Segmentation
  // ─────────────────────────────────────────────────────────────────────────
  it('UC09: should create Segment and evaluate Customer assignment', async () => {
    // 1. Create segment
    const segRes = await api
      .post('/api/v1/segments')
      .send({
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
    const evalRes = await api
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
