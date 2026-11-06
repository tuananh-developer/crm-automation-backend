import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { Quote } from '../src/modules/t12-workflows/entities/quote.entity.js';
import { QuoteApproval } from '../src/modules/t12-workflows/entities/quote-approval.entity.js';
import { WF12_NAME } from '../src/modules/t12-workflows/quotes.service.js';
import { WorkflowStatus } from '../src/modules/workflow/enums/workflow.enum.js';
import { WorkflowRun } from '../src/modules/workflow/entities/workflow-run.entity.js';

describe('Critical transaction integrity (PostgreSQL E2E)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;
  let adminToken: string;
  let adminUserId: string;
  let sourceId: string;
  const createdLeadIds: string[] = [];
  const workflowRunIds: string[] = [];
  const quoteIds: string[] = [];
  const suffix = Date.now().toString(36);
  const n8nSecret = `transaction-e2e-${suffix}-secret`;

  const api = {
    get: (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${accessToken}`),
    post: (path: string) =>
      request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${accessToken}`),
    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${accessToken}`),
  };

  const createLead = async (name: string, email: string, phone?: string) => {
    const response = await api.post('/api/v1/leads').send({
      firstName: name,
      lastName: 'Transaction Test',
      email,
      phone,
      companyName: 'Transaction Integrity Ltd',
      sourceId,
    });
    expect(response.status).toBe(201);
    const leadId = response.body.id as string;
    createdLeadIds.push(leadId);
    return leadId;
  };

  beforeAll(async () => {
    process.env.N8N_API_KEY = n8nSecret;
    process.env.N8N_WEBHOOK_SECRET = n8nSecret;

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
        name: 'Transaction E2E Sales',
        email: `transaction.e2e.${suffix}@example.test`,
        password: 'E2eStrongPassword123!',
      });
    expect(registration.status).toBe(201);
    accessToken = registration.body.accessToken;
    userId = registration.body.user.id;

    const sources = await dataSource.query(
      `INSERT INTO lead_sources (name, description, is_active)
       VALUES ($1, $2, true)
       RETURNING id;`,
      [`Transaction E2E Source ${suffix}`, 'Isolated transaction test fixture'],
    );
    sourceId = sources[0].id;

    const adminRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Transaction E2E Admin',
        email: `transaction.admin.${suffix}@example.test`,
        password: 'E2eStrongPassword123!',
      });
    expect(adminRegistration.status).toBe(201);
    adminUserId = adminRegistration.body.user.id;
    await dataSource.query(
      "UPDATE users SET role = 'ADMIN' WHERE id = $1;",
      [adminUserId],
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `transaction.admin.${suffix}@example.test`,
        password: 'E2eStrongPassword123!',
      });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.accessToken;
  });

  afterAll(async () => {
    if (createdLeadIds.length > 0) {
      await dataSource.query(
        'DELETE FROM notifications WHERE lead_id = ANY($1::uuid[]);',
        [createdLeadIds],
      );
      await dataSource.query(
        "DELETE FROM audit_logs WHERE entity_type = 'ReviewTask' AND entity_id IN (SELECT id FROM review_tasks WHERE lead_id = ANY($1::uuid[]));",
        [createdLeadIds],
      );
      await dataSource.query(
        'DELETE FROM review_tasks WHERE lead_id = ANY($1::uuid[]);',
        [createdLeadIds],
      );
      await dataSource.query(
        'DELETE FROM lead_qualifications WHERE lead_id = ANY($1::uuid[]);',
        [createdLeadIds],
      );
      await dataSource.query(
        "DELETE FROM audit_logs WHERE entity_type = 'Lead' AND entity_id = ANY($1::uuid[]);",
        [createdLeadIds],
      );
    }
    if (quoteIds.length > 0) {
      await dataSource.query(
        'DELETE FROM quote_approvals WHERE quote_id = ANY($1::uuid[]);',
        [quoteIds],
      );
      await dataSource.query('DELETE FROM quotes WHERE id = ANY($1::uuid[]);', [
        quoteIds,
      ]);
    }
    if (workflowRunIds.length > 0) {
      await dataSource.query(
        "DELETE FROM outbox_events WHERE payload->>'workflowRunId' = ANY($1::text[]);",
        [workflowRunIds],
      );
      await dataSource.query(
        'DELETE FROM workflow_runs WHERE id = ANY($1::uuid[]);',
        [workflowRunIds],
      );
    }
    if (createdLeadIds.length > 0) {
      await dataSource.query('DELETE FROM leads WHERE id = ANY($1::uuid[]);', [
        createdLeadIds,
      ]);
    }
    if (sourceId) {
      await dataSource.query('DELETE FROM lead_sources WHERE id = $1;', [
        sourceId,
      ]);
    }
    if (userId) {
      await dataSource.query('DELETE FROM users WHERE id = $1;', [userId]);
    }
    if (adminUserId) {
      await dataSource.query('DELETE FROM users WHERE id = $1;', [adminUserId]);
    }
    await app.close();
  });

  it('rolls back the complete qualification callback when Notification insert fails', async () => {
    const leadId = await createLead(
      'Qualification Rollback',
      `qualification.rollback.${suffix}@example.test`,
    );

    const triggerResponse = await api
      .post(`/api/v1/lead-intelligence/qualify/${leadId}`)
      .send({});
    expect(triggerResponse.status).toBe(202);
    const workflowRunId = triggerResponse.body.workflowRunId as string;
    workflowRunIds.push(workflowRunId);

    const triggerName = `trg_fail_qualification_notification_${suffix}`;
    const functionName = `fail_qualification_notification_${suffix}`;

    await dataSource.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.lead_id = '${leadId}'::uuid THEN
          RAISE EXCEPTION 'intentional notification insert failure'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await dataSource.query(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON notifications
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);

    try {
      const callback = await request(app.getHttpServer())
        .post('/api/v1/internal/n8n/lead-qualification/callback')
        .set('x-n8n-api-key', n8nSecret)
        .send({
          leadId,
          workflowRunId,
          status: 'QUALIFIED',
          confidence: 0.65,
          reason: 'Rollback integration test',
        });

      expect(callback.status).toBe(500);

      const [lead] = await dataSource.query(
        'SELECT status FROM leads WHERE id = $1;',
        [leadId],
      );
      const [run] = await dataSource.query(
        'SELECT status FROM workflow_runs WHERE id = $1;',
        [workflowRunId],
      );
      const [qualificationCount] = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM lead_qualifications WHERE workflow_run_id = $1;',
        [workflowRunId],
      );
      const [reviewTaskCount] = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM review_tasks WHERE workflow_run_id = $1;',
        [workflowRunId],
      );
      const [notificationCount] = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE lead_id = $1;',
        [leadId],
      );

      expect(lead.status).toBe('QUALIFYING');
      expect(run.status).toBe('PENDING');
      expect(Number(qualificationCount.count)).toBe(0);
      expect(Number(reviewTaskCount.count)).toBe(0);
      expect(Number(notificationCount.count)).toBe(0);
    } finally {
      await dataSource.query(
        `DROP TRIGGER IF EXISTS ${triggerName} ON notifications;`,
      );
      await dataSource.query(`DROP FUNCTION IF EXISTS ${functionName}();`);
    }
  });

  it('completes the UC10 scan, callback, report, apply and audit flow', async () => {
    const leadId = await createLead(
      'Cleaning Happy Path',
      `cleaning.happy.${suffix}@example.test`,
      '+1 (415) 555-0103',
    );

    const scan = await api.post('/api/v1/data-cleaning/scans').send({
      scope: 'FILTER',
      filter: { sourceId, limit: 100 },
    });
    expect(scan.status).toBe(202);
    const workflowRunId = scan.body.workflowRunId as string;
    workflowRunIds.push(workflowRunId);

    const findingId = randomUUID();
    const callback = await request(app.getHttpServer())
      .post('/api/v1/data-cleaning/callback')
      .set('x-n8n-api-key', n8nSecret)
      .send({
        workflowRunId,
        status: 'SUCCESS',
        summary: {
          totalLeadsScanned: 1,
          totalIssuesFound: 1,
          issuesByType: { INCONSISTENT_PHONE: 1 },
          issuesBySeverity: { LOW: 1 },
          duplicatesFound: 0,
          safeToApplyCount: 1,
        },
        findings: [
          {
            id: findingId,
            recordType: 'Lead',
            recordId: leadId,
            fieldName: 'phone',
            issueType: 'INCONSISTENT_PHONE',
            severity: 'LOW',
            currentValue: '+1 (415) 555-0103',
            proposedValue: '+14155550103',
            confidence: 0.92,
            reason: 'Normalize phone formatting',
            safeToApply: true,
            requiresHumanApproval: true,
          },
        ],
      });
    expect(callback.status).toBe(200);

    const report = await api.get(
      `/api/v1/data-cleaning/scans/${workflowRunId}`,
    );
    expect(report.status).toBe(200);
    expect(report.body.workflowRunId).toBe(workflowRunId);
    expect(report.body.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: findingId,
          recordId: leadId,
          fieldName: 'phone',
        }),
      ]),
    );

    const applied = await api
      .post(`/api/v1/data-cleaning/scans/${workflowRunId}/apply`)
      .send({ acceptedFindingIds: [findingId] });
    expect(applied.status).toBe(200);
    expect(applied.body.appliedCount).toBe(1);
    expect(applied.body.skippedCount).toBe(0);

    const [lead] = await dataSource.query(
      'SELECT phone FROM leads WHERE id = $1;',
      [leadId],
    );
    expect(lead.phone).toBe('+14155550103');

    const [auditCount] = await dataSource.query(
      "SELECT COUNT(*)::int AS count FROM audit_logs WHERE action = 'LEAD_DATA_CLEANED' AND entity_type = 'Lead' AND entity_id = $1;",
      [leadId],
    );
    expect(Number(auditCount.count)).toBe(1);
  });

  it('rolls back all Data Cleaning findings when a later Lead update fails', async () => {
    const firstLeadId = await createLead(
      'Cleaning First',
      `cleaning.first.${suffix}@example.test`,
      '+1 (415) 555-0101',
    );
    const secondLeadId = await createLead(
      'Cleaning Second',
      `cleaning.second.${suffix}@example.test`,
      '+1 (415) 555-0102',
    );

    const scan = await api.post('/api/v1/data-cleaning/scans').send({
      scope: 'FILTER',
      filter: { sourceId, limit: 100 },
    });
    expect(scan.status).toBe(202);
    const workflowRunId = scan.body.workflowRunId as string;
    workflowRunIds.push(workflowRunId);

    const firstFindingId = randomUUID();
    const secondFindingId = randomUUID();
    const callback = await request(app.getHttpServer())
      .post('/api/v1/data-cleaning/callback')
      .set('x-n8n-api-key', n8nSecret)
      .send({
        workflowRunId,
        status: 'SUCCESS',
        summary: {
          totalLeadsScanned: 2,
          totalIssuesFound: 2,
          issuesByType: { INCONSISTENT_PHONE: 2 },
          issuesBySeverity: { LOW: 2 },
          duplicatesFound: 0,
          safeToApplyCount: 2,
        },
        findings: [
          {
            id: firstFindingId,
            recordType: 'Lead',
            recordId: firstLeadId,
            fieldName: 'phone',
            issueType: 'INCONSISTENT_PHONE',
            severity: 'LOW',
            currentValue: '+1 (415) 555-0101',
            proposedValue: '+14155550101',
            confidence: 0.92,
            reason: 'Normalize phone formatting',
            safeToApply: true,
            requiresHumanApproval: true,
          },
          {
            id: secondFindingId,
            recordType: 'Lead',
            recordId: secondLeadId,
            fieldName: 'phone',
            issueType: 'INCONSISTENT_PHONE',
            severity: 'LOW',
            currentValue: '+1 (415) 555-0102',
            proposedValue: '+14155550102',
            confidence: 0.92,
            reason: 'Normalize phone formatting',
            safeToApply: true,
            requiresHumanApproval: true,
          },
        ],
      });
    expect(callback.status).toBe(200);

    const triggerName = `trg_fail_cleaning_lead_${suffix}`;
    const functionName = `fail_cleaning_lead_${suffix}`;
    await dataSource.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.id = '${secondLeadId}'::uuid THEN
          RAISE EXCEPTION 'intentional second Lead update failure'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await dataSource.query(`
      CREATE TRIGGER ${triggerName}
      BEFORE UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);

    try {
      const apply = await api
        .post(`/api/v1/data-cleaning/scans/${workflowRunId}/apply`)
        .send({ acceptedFindingIds: [firstFindingId, secondFindingId] });

      expect(apply.status).toBe(500);

      const leads = await dataSource.query(
        'SELECT id, phone FROM leads WHERE id = ANY($1::uuid[]) ORDER BY id;',
        [[firstLeadId, secondLeadId]],
      );
      const phonesById = new Map(leads.map((lead) => [lead.id, lead.phone]));
      expect(phonesById.get(firstLeadId)).toBe('+1 (415) 555-0101');
      expect(phonesById.get(secondLeadId)).toBe('+1 (415) 555-0102');

      const [auditCount] = await dataSource.query(
        "SELECT COUNT(*)::int AS count FROM audit_logs WHERE action = 'LEAD_DATA_CLEANED' AND entity_id = ANY($1::uuid[]);",
        [[firstLeadId, secondLeadId]],
      );
      expect(Number(auditCount.count)).toBe(0);

      const [run] = await dataSource.query(
        'SELECT status, output_payload FROM workflow_runs WHERE id = $1;',
        [workflowRunId],
      );
      expect(run.status).toBe('SUCCESS');
      expect(run.output_payload.appliedFindingIds ?? []).toEqual([]);
      expect(run.output_payload.appliedStats ?? []).toEqual([]);
    } finally {
      await dataSource.query(`DROP TRIGGER IF EXISTS ${triggerName} ON leads;`);
      await dataSource.query(`DROP FUNCTION IF EXISTS ${functionName}();`);
    }
  });

  it('returns one success and one 409 for concurrent registrations with the same email', async () => {
    const email = `register.race.${suffix}@example.test`;
    const register = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Concurrent Registration',
          email,
          password: 'E2eStrongPassword123!',
        });

    const responses = await Promise.all([register(), register()]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);

    const [users] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM users WHERE email = $1;',
      [email],
    );
    expect(Number(users.count)).toBe(1);
  });

  it('enforces a dedicated rate limit on repeated failed login attempts', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `nonexistent.login.${suffix}@example.test`,
          password: 'IncorrectPassword123!',
        });
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
    expect(statuses.filter((status) => status === 401).length).toBeGreaterThan(0);
  });

  it('preserves Lead contact edits when review resolution runs concurrently', async () => {
    const leadId = await createLead(
      'Review Concurrency',
      `review.concurrency.${suffix}@example.test`,
      '+1 (415) 555-0104',
    );

    const task = await api.post('/api/v1/review-tasks').send({
      leadId,
      reason: 'Concurrent status and contact update regression',
    });
    expect(task.status).toBe(201);
    const reviewTaskId = task.body.id as string;

    const assigned = await api
      .patch(`/api/v1/review-tasks/${reviewTaskId}/assign`)
      .send({ reviewerId: userId });
    expect(assigned.status).toBe(200);

    const started = await api.patch(
      `/api/v1/review-tasks/${reviewTaskId}/start`,
    );
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('IN_REVIEW');

    const [leadUpdate, resolution] = await Promise.all([
      api.patch(`/api/v1/leads/${leadId}`).send({
        phone: '+14155550199',
        notes: 'Updated while review was being resolved',
      }),
      api.patch(`/api/v1/review-tasks/${reviewTaskId}/resolve`).send({
        decision: 'APPROVE',
        reviewComment: 'Approved during concurrent Lead update',
      }),
    ]);

    expect(leadUpdate.status).toBe(200);
    expect(resolution.status).toBe(200);
    expect(resolution.body.status).toBe('RESOLVED');

    const [lead] = await dataSource.query(
      'SELECT status, phone, notes FROM leads WHERE id = $1;',
      [leadId],
    );
    expect(lead.status).toBe('QUALIFIED');
    expect(lead.phone).toBe('+14155550199');
    expect(lead.notes).toBe('Updated while review was being resolved');

    const [taskRow] = await dataSource.query(
      'SELECT status, decision FROM review_tasks WHERE id = $1;',
      [reviewTaskId],
    );
    expect(taskRow.status).toBe('RESOLVED');
    expect(taskRow.decision).toBe('APPROVE');
  });

  it('rolls back user role changes when AuditLog persistence fails', async () => {
    const triggerName = `trg_fail_user_audit_${suffix}`;
    const functionName = `fail_user_audit_${suffix}`;
    const [beforeAuditCount] = await dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM audit_logs
       WHERE entity_type = 'User'
         AND entity_id = $1
         AND action = 'USER_UPDATED';`,
      [userId],
    );

    await dataSource.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger
      LANGUAGE plpgsql
      AS $
      BEGIN
        IF NEW.entity_type = 'User'
          AND NEW.entity_id = '${userId}'::uuid
          AND NEW.action = 'USER_UPDATED' THEN
          RAISE EXCEPTION 'intentional user audit insert failure'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $;
    `);
    await dataSource.query(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);

    try {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN' });

      expect(response.status).toBe(500);

      const [user] = await dataSource.query(
        'SELECT role FROM users WHERE id = $1;',
        [userId],
      );
      expect(user.role).toBe('SALES');

      const [afterAuditCount] = await dataSource.query(
        `SELECT COUNT(*)::int AS count
         FROM audit_logs
         WHERE entity_type = 'User'
           AND entity_id = $1
           AND action = 'USER_UPDATED';`,
        [userId],
      );
      expect(Number(afterAuditCount.count)).toBe(
        Number(beforeAuditCount.count),
      );
    } finally {
      await dataSource.query(
        `DROP TRIGGER IF EXISTS ${triggerName} ON audit_logs;`,
      );
      await dataSource.query(
        `DROP FUNCTION IF EXISTS ${functionName}();`,
      );
    }
  });

  it('enforces Admin-only quote approval and persists approve/reject decisions', async () => {
    const quoteLeadId = createdLeadIds[0];
    if (!quoteLeadId) {
      throw new Error('A Lead fixture must exist before Quote approval');
    }

    const createPendingQuote = async (title: string) => {
      const run = await dataSource.getRepository(WorkflowRun).save({
        workflowName: WF12_NAME,
        n8nExecutionId: null,
        leadId: quoteLeadId,
        customerId: null,
        triggeredByUserId: userId,
        status: WorkflowStatus.SUCCESS,
        inputPayload: {},
        outputPayload: {},
        errorMessage: null,
        startedAt: new Date(),
        finishedAt: new Date(),
        idempotencyKey: null,
      });
      workflowRunIds.push(run.id);

      const quote = await dataSource.getRepository(Quote).save({
        workflowRunId: run.id,
        createdBy: userId,
        customerId: null,
        leadId: quoteLeadId,
        title,
        executiveSummary: null,
        body: null,
        currency: 'USD',
        subtotal: '1000.00',
        discountTotal: '250.00',
        taxTotal: '0.00',
        totalAmount: '750.00',
        status: 'PENDING_APPROVAL',
        approvalRequired: true,
        submittedForApprovalAt: new Date(),
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        pricingSnapshot: { currency: 'USD', lineItems: [] },
      });
      quoteIds.push(quote.id);

      await dataSource.getRepository(QuoteApproval).save({
        quoteId: quote.id,
        requestedBy: userId,
        reviewedBy: null,
        status: 'PENDING',
        decisionComment: null,
        idempotencyKey: `e2e-quote-approval-${quote.id}`,
        resolvedAt: null,
      });
      return quote.id;
    };

    const approvalQuoteId = await createPendingQuote(`Approval ${suffix}`);
    const salesAttempt = await api
      .post(`/api/v1/quotes/${approvalQuoteId}/approve`)
      .send({ comment: 'Sales must not approve quotes' });
    expect(salesAttempt.status).toBe(403);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${approvalQuoteId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'Approved after review' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');

    const [approvedQuote] = await dataSource.query(
      'SELECT status, approved_by FROM quotes WHERE id = $1;',
      [approvalQuoteId],
    );
    const [approvedRequest] = await dataSource.query(
      'SELECT status, reviewed_by FROM quote_approvals WHERE quote_id = $1;',
      [approvalQuoteId],
    );
    expect(approvedQuote.status).toBe('APPROVED');
    expect(approvedQuote.approved_by).toBe(adminUserId);
    expect(approvedRequest.status).toBe('APPROVED');
    expect(approvedRequest.reviewed_by).toBe(adminUserId);

    const rejectedQuoteId = await createPendingQuote(`Rejection ${suffix}`);
    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${rejectedQuoteId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'Discount exceeds the permitted policy' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('REJECTED');

    const [rejectedQuote] = await dataSource.query(
      'SELECT status, rejection_reason FROM quotes WHERE id = $1;',
      [rejectedQuoteId],
    );
    const [rejectedRequest] = await dataSource.query(
      'SELECT status, decision_comment FROM quote_approvals WHERE quote_id = $1;',
      [rejectedQuoteId],
    );
    expect(rejectedQuote.status).toBe('REJECTED');
    expect(rejectedQuote.rejection_reason).toBe(
      'Discount exceeds the permitted policy',
    );
    expect(rejectedRequest.status).toBe('REJECTED');
    expect(rejectedRequest.decision_comment).toBe(
      'Discount exceeds the permitted policy',
    );
  });
});
