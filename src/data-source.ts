import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { InitialSchema1727866977000 } from './database/migrations/1727866977000-InitialSchema.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: ['dist/modules/**/*.entity.js'],
  migrations: [InitialSchema1727866977000],
  migrationsTableName: 'typeorm_migrations',
});
