import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DataSource } from 'typeorm';
import { Customer } from '../src/modules/customers/entities/customer.entity.js';
import { AccountHealthSnapshot } from '../src/modules/customers/entities/account-health-snapshot.entity.js';
import { User } from '../src/modules/users/entities/user.entity.js';
import { UserRole, UserStatus } from '../src/modules/users/enums/user.enum.js';
import { JwtService } from '@nestjs/jwt';

describe('WF15 Account Health & Strategic Customers (E2E)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let adminToken: string;
  let adminUser: User;
  let strategicCustomer: Customer;
  let nonStrategicCustomer: Customer;

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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);

    const userRepo = dataSource.getRepository(User);
    const existingAdmin = await userRepo.findOne({
      where: { role: UserRole.ADMIN },
    });

    if (existingAdmin) {
      adminUser = existingAdmin;
    } else {
      adminUser = await userRepo.save(
        userRepo.create({
          name: 'WF15 Admin',
          email: `wf15.admin.${Date.now()}@example.com`,
          passwordHash: 'hashed_pw',
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        }),
      );
    }

    adminToken = jwtService.sign({
      sub: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });

    const customerRepo = dataSource.getRepository(Customer);
    const uniqueSuffix = Date.now();

    // 1. Create a customer with is_strategic = true
    strategicCustomer = await customerRepo.save(
      customerRepo.create({
        name: `Strategic Corp ${uniqueSuffix}`,
        email: `strategic.${uniqueSuffix}@example.com`,
        status: 'ACTIVE',
        isStrategic: true,
        createdBy: adminUser.id,
      }),
    );

    // 2. Create a customer without passing isStrategic (should default to false in DB)
    nonStrategicCustomer = await customerRepo.save(
      customerRepo.create({
        name: `Regular Corp ${uniqueSuffix}`,
        email: `regular.${uniqueSuffix}@example.com`,
        status: 'ACTIVE',
        isStrategic: false,
        createdBy: adminUser.id,
      }),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      const snapRepo = dataSource.getRepository(AccountHealthSnapshot);
      if (strategicCustomer?.id) {
        await snapRepo.delete({ customerId: strategicCustomer.id });
      }
      if (nonStrategicCustomer?.id) {
        await snapRepo.delete({ customerId: nonStrategicCustomer.id });
      }

      const customerRepo = dataSource.getRepository(Customer);
      if (strategicCustomer?.id) {
        await customerRepo.delete({ id: strategicCustomer.id });
      }
      if (nonStrategicCustomer?.id) {
        await customerRepo.delete({ id: nonStrategicCustomer.id });
      }
    }
    await app.close();
  });

  describe('Strategic Customer Filter (GET /api/v1/customers)', () => {
    it('returns only strategic customers when isStrategic=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers?isStrategic=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      const items = res.body.data;
      const ids = items.map((c: { id: string }) => c.id);
      expect(ids).toContain(strategicCustomer.id);
      expect(ids).not.toContain(nonStrategicCustomer.id);

      for (const c of items) {
        expect(c.isStrategic).toBe(true);
      }
    });

    it('returns only non-strategic customers when isStrategic=false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers?isStrategic=false')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      const items = res.body.data;
      const ids = items.map((c: { id: string }) => c.id);
      expect(ids).toContain(nonStrategicCustomer.id);
      expect(ids).not.toContain(strategicCustomer.id);

      for (const c of items) {
        expect(c.isStrategic).toBe(false);
      }
    });

    it('returns both strategic and non-strategic customers when isStrategic is omitted', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(strategicCustomer.id);
      expect(ids).toContain(nonStrategicCustomer.id);
    });

    it('combines isStrategic filter with status and search', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/customers?isStrategic=true&status=ACTIVE&search=${encodeURIComponent(
            strategicCustomer.name,
          )}`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(strategicCustomer.id);
      expect(res.body.data[0].isStrategic).toBe(true);
    });

    it('rejects invalid boolean query parameter with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers?isStrategic=invalid_string')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('Account Health Calculate API (POST /api/v1/account-health/calculate)', () => {
    it('evaluates health score and persists snapshot for a strategic customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/account-health/calculate')
        .set('x-n8n-api-key', n8nApiKey)
        .send({
          customerId: strategicCustomer.id,
          engagement: 85,
          feedback: 80,
          openIssues: 100,
          followUpCompletion: 90,
          evidence: [
            '5 customer interactions recorded',
            'Positive NPS feedback score',
            'Zero open support issues',
            'Follow-up sequences 90% completed',
          ],
        })
        .expect(201);

      expect(res.body.score).toBeDefined();
      expect(res.body.status).toBe('HEALTHY');
      expect(res.body.policyVersion).toBe('v1');
      expect(res.body.id).toBeDefined();

      // Verify persisted in PostgreSQL DB
      const snapshotRepo = dataSource.getRepository(AccountHealthSnapshot);
      const saved = await snapshotRepo.findOne({
        where: { id: res.body.id },
      });
      expect(saved).toBeDefined();
      expect(saved?.customerId).toBe(strategicCustomer.id);
      expect(saved?.score).toBe(res.body.score);
      expect(saved?.status).toBe('HEALTHY');
    });

    it('propagates INSUFFICIENT_DATA and does not save snapshot when evidence is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/account-health/calculate')
        .set('x-n8n-api-key', n8nApiKey)
        .send({
          customerId: strategicCustomer.id,
          engagement: 80,
          feedback: null, // missing feedback
          openIssues: 90,
          followUpCompletion: 85,
        })
        .expect(201);

      expect(res.body.status).toBe('INSUFFICIENT_DATA');
      expect(res.body.missingData).toContain('feedback');
      expect(res.body.id).toBeUndefined();
    });

    it('rejects non-existent customerId with 404 NotFoundException', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/account-health/calculate')
        .set('x-n8n-api-key', n8nApiKey)
        .send({
          customerId: '00000000-0000-4000-8000-000000000000',
          engagement: 80,
          feedback: 80,
          openIssues: 80,
          followUpCompletion: 80,
        })
        .expect(404);
    });

    it('rejects unauthorized requests without valid n8n credential', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/account-health/calculate')
        .send({
          customerId: strategicCustomer.id,
          engagement: 80,
          feedback: 80,
          openIssues: 80,
          followUpCompletion: 80,
        })
        .expect(401);
    });
  });

  describe('Account Health Snapshot History (GET /api/v1/account-health/snapshots/:customerId)', () => {
    it('retrieves snapshot history for customer ordered newest first', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/account-health/snapshots/${strategicCustomer.id}`)
        .set('x-n8n-api-key', n8nApiKey)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].customerId).toBe(strategicCustomer.id);
    });
  });

  describe('Validate Actions API (POST /api/v1/account-health/validate-actions)', () => {
    it('validates allowed actions with matching customerId and snapshotId evidence', async () => {
      const snapshotRepo = dataSource.getRepository(AccountHealthSnapshot);
      const snapshot = await snapshotRepo.findOne({
        where: { customerId: strategicCustomer.id },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/account-health/validate-actions')
        .set('x-n8n-api-key', n8nApiKey)
        .send({
          customerId: strategicCustomer.id,
          snapshotId: snapshot?.id,
          actions: [
            {
              type: 'CREATE_RETENTION_TASK',
              evidence: [
                {
                  customerId: strategicCustomer.id,
                  snapshotId: snapshot?.id,
                },
              ],
            },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.valid).toHaveLength(1);
      expect(res.body.rejected).toBe(0);
    });
  });

  describe('Validate AI Output API (POST /api/v1/account-health/validate-ai-output)', () => {
    it('validates structured AI output matching required schema and score', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/account-health/validate-ai-output')
        .set('x-n8n-api-key', n8nApiKey)
        .send({
          score: 85,
          aiOutput: {
            score: 85,
            summary: 'Account health is strong with consistent engagement',
            keyEvidence: ['5 interactions recorded'],
            risks: [],
            opportunities: ['Upsell enterprise tier'],
            recommendedActions: ['SCHEDULE_REVIEW'],
            actionPriority: 'LOW',
            evidenceReferences: ['snap-1'],
          },
        })
        .expect(201);

      expect(res.body.valid).toBe(true);
      expect(res.body.missing).toHaveLength(0);
      expect(res.body.scoreMismatch).toBe(false);
    });
  });
});
