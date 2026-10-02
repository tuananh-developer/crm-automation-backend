import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Environment variables are loaded by the NestJS ConfigModule (or .env via dotenv in app bootstrap).
// For the TypeORM CLI, ensure a .env file exists or the env vars are exported before running migration scripts.

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [
    // Identity & Access
    'src/modules/users/entities/*.entity.ts',
    // Lead Management
    'src/modules/leads/entities/*.entity.ts',
    // AI Lead Intelligence
    'src/modules/lead-intelligence/entities/*.entity.ts',
    // Follow-up Automation
    'src/modules/follow-up/entities/*.entity.ts',
    // Customer Management
    'src/modules/customers/entities/*.entity.ts',
    // Workflow & Governance
    'src/modules/workflow/entities/*.entity.ts',
    'src/modules/review/entities/*.entity.ts',
    'src/modules/notifications/entities/*.entity.ts',
    'src/modules/audit/entities/*.entity.ts',
  ],
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});
