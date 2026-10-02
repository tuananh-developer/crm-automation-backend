import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { InitialSchema1727866977000 } from './database/migrations/1727866977000-InitialSchema.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'crm_db',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: ['dist/modules/**/*.entity.js'],
  migrations: [InitialSchema1727866977000],
  migrationsTableName: 'typeorm_migrations',
});
