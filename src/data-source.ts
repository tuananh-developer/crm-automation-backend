import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { resolvePostgresConnectionOptions } from './config/postgres-ssl.js';
import { InitialSchema1727866977000 } from './database/migrations/1727866977000-InitialSchema.js';
import { AddEnrollmentActiveUniqueIndex1728400000000 } from './database/migrations/1728400000000-AddEnrollmentActiveUniqueIndex.js';
import { AddOutboxEventsTable1729000000000 } from './database/migrations/1729000000000-AddOutboxEventsTable.js';
import { AddOutboxProcessingLease1793476900000 } from './database/migrations/1793476900000-AddOutboxProcessingLease.js';
import { AddOutboxHttpDispatch1793477000000 } from './database/migrations/1793477000000-AddOutboxHttpDispatch.js';
import { AddWorkflowExecutionClaimLease1793477100000 } from './database/migrations/1793477100000-AddWorkflowExecutionClaimLease.js';
import { CreateCommunicationDeliveries1793477200000 } from './database/migrations/1793477200000-CreateCommunicationDeliveries.js';
import { AddT12WorkflowDomains1793476800000 } from './database/migrations/1793476800000-AddT12WorkflowDomains.js';
import { AddRenewalTables1810000000000 } from './database/migrations/1810000000000-AddRenewalTables.js';

const isProduction = process.env.NODE_ENV === 'production';
const dbUrl = process.env.DATABASE_URL;
const sslCa = process.env.DB_SSL_CA?.split(String.raw`\n`).join('\n');
const forceSsl = process.env.DB_SSL === 'true' || isProduction;
const remoteConnection = dbUrl
  ? resolvePostgresConnectionOptions(dbUrl, {
      forceSsl,
      ca: sslCa,
    })
  : undefined;
const sslConfig =
  remoteConnection?.ssl ??
  (forceSsl
    ? { rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) }
    : false);

export const AppDataSource = new DataSource(
  dbUrl
    ? {
        type: 'postgres',
        url: remoteConnection?.url,
        ssl: sslConfig,
        synchronize: false,
        logging: !isProduction,
        entities: [
          'dist/modules/**/*.entity.js',
          'dist/infrastructure/**/*.entity.js',
        ],
        migrations: [
          InitialSchema1727866977000,
          AddEnrollmentActiveUniqueIndex1728400000000,
          AddOutboxEventsTable1729000000000,
          AddT12WorkflowDomains1793476800000,
          AddOutboxProcessingLease1793476900000,
          AddOutboxHttpDispatch1793477000000,
          AddWorkflowExecutionClaimLease1793477100000,
          CreateCommunicationDeliveries1793477200000,
          AddRenewalTables1810000000000,
        ],
        migrationsTableName: 'typeorm_migrations',
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: sslConfig,
        synchronize: false,
        logging: !isProduction,
        entities: [
          'dist/modules/**/*.entity.js',
          'dist/infrastructure/**/*.entity.js',
        ],
        migrations: [
          InitialSchema1727866977000,
          AddEnrollmentActiveUniqueIndex1728400000000,
          AddOutboxEventsTable1729000000000,
          AddT12WorkflowDomains1793476800000,
          AddOutboxProcessingLease1793476900000,
          AddOutboxHttpDispatch1793477000000,
          AddWorkflowExecutionClaimLease1793477100000,
          CreateCommunicationDeliveries1793477200000,
          AddRenewalTables1810000000000,
        ],
        migrationsTableName: 'typeorm_migrations',
      },
);
