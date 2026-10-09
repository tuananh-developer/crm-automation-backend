import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { InitialSchema1727866977000 } from './database/migrations/1727866977000-InitialSchema.js';
import { AddEnrollmentActiveUniqueIndex1728400000000 } from './database/migrations/1728400000000-AddEnrollmentActiveUniqueIndex.js';

const isProduction = process.env.NODE_ENV === 'production';
const dbUrl = process.env.DATABASE_URL;
const useSsl =
  process.env.DB_SSL === 'true' ||
  isProduction ||
  Boolean(
    dbUrl &&
    (dbUrl.includes('sslmode=require') ||
      dbUrl.includes('supabase') ||
      dbUrl.includes('neon.tech') ||
      dbUrl.includes('render.com')),
  );

const sslConfig = useSsl ? { rejectUnauthorized: false } : false;

export const AppDataSource = new DataSource(
  dbUrl
    ? {
        type: 'postgres',
        url: dbUrl,
        ssl: sslConfig,
        synchronize: false,
        logging: !isProduction,
        entities: ['dist/modules/**/*.entity.js'],
        migrations: [
          InitialSchema1727866977000,
          AddEnrollmentActiveUniqueIndex1728400000000,
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
        entities: ['dist/modules/**/*.entity.js'],
        migrations: [
          InitialSchema1727866977000,
          AddEnrollmentActiveUniqueIndex1728400000000,
        ],
        migrationsTableName: 'typeorm_migrations',
      },
);
