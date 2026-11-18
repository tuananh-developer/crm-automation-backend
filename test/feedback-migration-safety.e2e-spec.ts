import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { CreateFeedbackAndCustomerTasksTables1728600000000 } from '../src/database/migrations/1728600000000-CreateFeedbackAndCustomerTasksTables.js';

describe('WF14 Customer Feedback Migration & Service Auth (PostgreSQL E2E)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;
  let customerId: string;
  const suffix = Date.now().toString(36);
  const n8nSecret = `wf14-e2e-${suffix}-secret`;

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

    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'WF14 E2E Owner',
        email: `wf14.owner.${suffix}@example.test`,
        password: 'E2eStrongPassword123!',
      });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;
    userId = register.body.user.id as string;

    customerId = randomUUID();
    await dataSource.query(
      `INSERT INTO "customers" ("id", "name", "email", "created_by")
       VALUES ($1, $2, $3, $4)`,
      [
        customerId,
        `WF14 Feedback Customer ${suffix}`,
        `wf14.cust.${suffix}@example.test`,
        userId,
      ],
    );

    await dataSource.query(
      `INSERT INTO "customer_feedback" ("id", "customer_id", "source", "channel", "content", "content_redacted", "status")
       VALUES ($1, $2, 'WEB', 'PORTAL', 'Fast onboarding experience', 'Fast onboarding experience', 'NEW')`,
      [randomUUID(), customerId],
    );
  });

  afterAll(async () => {
    try {
      if (customerId) {
        await dataSource.query(
          'DELETE FROM "customer_feedback" WHERE "customer_id" = $1;',
          [customerId],
        );
        await dataSource.query('DELETE FROM "customers" WHERE "id" = $1;', [
          customerId,
        ]);
      }
      if (userId) {
        await dataSource.query('DELETE FROM "users" WHERE "id" = $1;', [
          userId,
        ]);
      }
    } finally {
      await app?.close();
    }
  });

  it('serves GET /api/v1/customers/:customerId/feedback to both JWT browser callers and WF05 X-N8N-API-KEY callers while failing closed for unauthorized callers', async () => {
    const unauth = await request(app.getHttpServer()).get(
      `/api/v1/customers/${customerId}/feedback`,
    );
    expect(unauth.status).toBe(401);

    const wrongKey = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/feedback`)
      .set('X-N8N-API-KEY', 'wrong-secret');
    expect(wrongKey.status).toBe(401);

    const jwtRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/feedback`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(jwtRes.status).toBe(200);
    expect(Array.isArray(jwtRes.body)).toBe(true);
    expect(jwtRes.body.length).toBeGreaterThanOrEqual(1);

    const n8nRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/feedback`)
      .set('X-N8N-API-KEY', n8nSecret);
    expect(n8nRes.status).toBe(200);
    expect(Array.isArray(n8nRes.body)).toBe(true);
    expect(n8nRes.body.length).toBeGreaterThanOrEqual(1);

    const internalRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}/feedback/internal`)
      .set('X-N8N-API-KEY', n8nSecret);
    expect(internalRes.status).toBe(200);
    expect(internalRes.body.length).toBeGreaterThanOrEqual(1);

    const internalUnauth = await request(app.getHttpServer()).get(
      `/api/v1/customers/${customerId}/feedback/internal`,
    );
    expect(internalUnauth.status).toBe(401);
  });

  it('preserves a pre-existing shared empty customer_tasks table when rolling back WF14 migration', async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const migration = new CreateFeedbackAndCustomerTasksTables1728600000000();

      // Simulate a pre-existing shared customer_tasks table with 0 rows and no churn columns/migration
      await queryRunner.query('DELETE FROM "customer_tasks";');
      await queryRunner.query(
        'ALTER TABLE "customer_tasks" DROP COLUMN IF EXISTS "churn_assessment_id", DROP COLUMN IF EXISTS "assessment_id";',
      );

      await migration.down(queryRunner);

      const [tasksTableAfterDown] = (await queryRunner.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_tasks'
        ) AS "exists";`,
      )) as Array<{ exists: boolean }>;
      expect(tasksTableAfterDown.exists).toBe(true);

      const [feedbackColAfterDown] = (await queryRunner.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_tasks' AND column_name = 'customer_feedback_id'
        ) AS "exists";`,
      )) as Array<{ exists: boolean }>;
      expect(feedbackColAfterDown.exists).toBe(false);

      const [feedbackTableAfterDown] = (await queryRunner.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_feedback'
        ) AS "exists";`,
      )) as Array<{ exists: boolean }>;
      expect(feedbackTableAfterDown.exists).toBe(false);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });
});
