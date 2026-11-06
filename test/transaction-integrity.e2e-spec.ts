import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';

describe('Critical transaction integrity (PostgreSQL E2E)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;
  let sourceId: string;
  const createdLeadIds: string[] = [];
  const workflowRunIds: string[] = [];
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
    createdLeadIds.push(response.body.id);
    return response.body.id as string;
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
  });

  afterAll(async () => {
    if (createdLeadIds.length > 0) {
      await dataSource.query(
        'DELETE FROM notifications WHERE lead_id = ANY($1::uuid[]);',
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

      const leads = (await dataSource.query(
        'SELECT id, phone FROM leads WHERE id = ANY($1::uuid[]) ORDER BY id;',
        [[firstLeadId, secondLeadId]],
      )) as Array<{ id: string; phone: string }>;
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
});
