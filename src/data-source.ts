import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { InitialSchema1727866977000 } from './database/migrations/1727866977000-InitialSchema.js';
import { User } from './modules/users/entities/user.entity.js';
import {
  LeadSource,
  Lead,
  Interaction,
} from './modules/leads/entities/index.js';
import {
  Customer,
  Segment,
  CustomerSegment,
} from './modules/customers/entities/index.js';
import {
  FollowUpSequence,
  FollowUpStep,
  LeadFollowUpEnrollment,
  FollowUpExecution,
} from './modules/follow-up/entities/index.js';
import {
  LeadQualification,
  LeadEnrichment,
  LeadScore,
} from './modules/lead-intelligence/entities/index.js';
import { WorkflowRun } from './modules/workflow/entities/workflow-run.entity.js';
import { ReviewTask } from './modules/review/entities/review-task.entity.js';
import { Notification } from './modules/notifications/entities/notification.entity.js';
import { AuditLog } from './modules/audit/entities/audit-log.entity.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'crm_backend',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [
    User,
    LeadSource,
    Lead,
    Interaction,
    Customer,
    Segment,
    CustomerSegment,
    FollowUpSequence,
    FollowUpStep,
    LeadFollowUpEnrollment,
    FollowUpExecution,
    LeadQualification,
    LeadEnrichment,
    LeadScore,
    WorkflowRun,
    ReviewTask,
    Notification,
    AuditLog,
  ],
  migrations: [InitialSchema1727866977000],
  migrationsTableName: 'typeorm_migrations',
});
