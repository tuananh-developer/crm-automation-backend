import { Module } from '@nestjs/common';
import { ObserveModule } from './observe.js';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { LeadIntelligenceModule } from './modules/lead-intelligence/lead-intelligence.module.js';
import { FollowUpModule } from './modules/follow-up/follow-up.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { WorkflowModule } from './modules/workflow/workflow.module.js';
import { ReviewModule } from './modules/review/review.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './modules/audit/audit.module.js';
import { RabbitMQModule } from './infrastructure/rabbitmq/rabbitmq.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DataCleaningModule } from './modules/data-cleaning/data-cleaning.module.js';
import { T12WorkflowsModule } from './modules/t12-workflows/t12-workflows.module.js';
import { CommunicationModule } from './modules/communication/communication.module.js';
import { resolvePostgresConnectionOptions } from './config/postgres-ssl.js';
import { validateEnvironmentConfiguration } from './config/environment.validation.js';

@Module({
  imports: [
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        appKey: config.get<string>('OBSERVE_APP_KEY'),
        appSecret: config.get<string>('OBSERVE_APP_SECRET'),
        serviceId: 'crm-automation-backend',
        enabled: config.get<string>('NODE_ENV') === 'production',
      }),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    ScheduleModule.forRoot(),
    RabbitMQModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Validate at provider initialization rather than ConfigModule import time.
        // This preserves runtime env overrides used by E2E fixtures and test harnesses.
        validateEnvironmentConfiguration(process.env);

        const isProd =
          (config.get<string>('NODE_ENV') || '').trim().toLowerCase() ===
          'production';
        const useLocalDb = config.get<string>('USE_LOCAL_DB') === 'true';
        const dbUrl = config.get<string>('DATABASE_URL')?.trim();

        if (isProd && (useLocalDb || !dbUrl)) {
          throw new Error(
            'FATAL: DATABASE_URL is required in production and USE_LOCAL_DB must not be true',
          );
        }

        // Connect to remote database (Neon / Supabase) if in production or DATABASE_URL provided without USE_LOCAL_DB
        if (!useLocalDb && dbUrl) {
          const sslCa = config
            .get<string>('DB_SSL_CA')
            ?.split(String.raw`\n`)
            .join('\n');
          const connection = resolvePostgresConnectionOptions(dbUrl, {
            forceSsl: config.get<string>('DB_SSL') === 'true' || isProd,
            ca: sslCa,
          });

          return {
            type: 'postgres',
            url: connection.url,
            ssl: connection.ssl,
            autoLoadEntities: true,
            synchronize: false,
          };
        }

        // Development mode: Fallback to local Docker Postgres (crm_postgres)
        const localHost =
          config.get<string>('LOCAL_DB_HOST') ||
          config.get<string>('DB_HOST') ||
          'localhost';
        const localPort =
          config.get<number>('LOCAL_DB_PORT') ||
          config.get<number>('DB_PORT', 5432);
        const localUser =
          config.get<string>('LOCAL_DB_USER') ||
          config.get<string>('DB_USER') ||
          'postgres';
        const localPassword =
          config.get<string>('LOCAL_DB_PASSWORD') ||
          config.get<string>('DB_PASSWORD') ||
          'postgres';
        const localDb =
          config.get<string>('LOCAL_DB_NAME') ||
          config.get<string>('DB_NAME') ||
          'crm_backend';

        return {
          type: 'postgres',
          host: localHost,
          port: localPort,
          username: localUser,
          password: localPassword,
          database: localDb,
          ssl: false,
          autoLoadEntities: true,
          synchronize: false,
        };
      },
    }),
    HealthModule,
    UsersModule,
    LeadsModule,
    LeadIntelligenceModule,
    FollowUpModule,
    CustomersModule,
    WorkflowModule,
    ReviewModule,
    NotificationsModule,
    AuditModule,
    AuthModule,
    DataCleaningModule,
    T12WorkflowsModule,
    CommunicationModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
