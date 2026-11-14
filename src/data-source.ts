import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { resolvePostgresConnectionOptions } from './config/postgres-ssl.js';
import { validateEnvironmentConfiguration } from './config/environment.validation.js';
import { InitialSchema1727866977000 } from './database/migrations/1727866977000-InitialSchema.js';
import { AddEnrollmentActiveUniqueIndex1728400000000 } from './database/migrations/1728400000000-AddEnrollmentActiveUniqueIndex.js';
import { AddOutboxEventsTable1729000000000 } from './database/migrations/1729000000000-AddOutboxEventsTable.js';
import { AddOutboxProcessingLease1793476900000 } from './database/migrations/1793476900000-AddOutboxProcessingLease.js';
import { AddOutboxHttpDispatch1793477000000 } from './database/migrations/1793477000000-AddOutboxHttpDispatch.js';
import { AddWorkflowExecutionClaimLease1793477100000 } from './database/migrations/1793477100000-AddWorkflowExecutionClaimLease.js';
import { CreateCommunicationDeliveries1793477200000 } from './database/migrations/1793477200000-CreateCommunicationDeliveries.js';
import { AddT12WorkflowDomains1793476800000 } from './database/migrations/1793476800000-AddT12WorkflowDomains.js';

const isProduction = process.env.NODE_ENV === 'production';
const useLocalDb = process.env.USE_LOCAL_DB === 'true';
const dbUrl = process.env.DATABASE_URL?.trim();
const sslCa = process.env.DB_SSL_CA?.split(String.raw`\\n`).join('\\n');

if (isProduction) {
  validateEnvironmentConfiguration(process.env);
}

const useRemoteDatabase = Boolean(dbUrl) && !useLocalDb;
const remoteConnection = useRemoteDatabase && dbUrl
  ? resolvePostgresConnectionOptions(dbUrl, {
      forceSsl: process.env.DB_SSL === 'true' || isProduction,
      ca: sslCa,
    })
  : undefined;

const localConnection = {
  type: 'postgres' as const,
  host:
    process.env.LOCAL_DB_HOST ||
    process.env.DB_HOST ||
    'localhost',
  port: Number.parseInt(
    process.env.LOCAL_DB_PORT || process.env.DB_PORT || '5432',
    10,
  ),
  username:
    process.env.LOCAL_DB_USER ||
    process.env.DB_USER ||
    'postgres',
  password:
    process.env.LOCAL_DB_PASSWORD ||
    process.env.DB_PASSWORD ||
    'postgres',
  database:
    process.env.LOCAL_DB_NAME ||
    process.env.DB_NAME ||
    'crm_backend',
  ssl: false as const,
};

export const AppDataSource = new DataSource({
  ...(remoteConnection
    ? {
        type: 'postgres' as const,
        url: remoteConnection.url,
        ssl: remoteConnection.ssl,
      }
    : localConnection),
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
  ],
  migrationsTableName: 'typeorm_migrations',
});
