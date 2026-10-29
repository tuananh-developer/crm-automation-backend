import { Module } from '@nestjs/common';
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
import { CommunicationModule } from './modules/communication/communication.module.js';

@Module({
  imports: [
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
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const useLocalDb = config.get<string>('USE_LOCAL_DB') === 'true';
        const dbUrl = config.get<string>('DATABASE_URL');

        // Connect to remote database (Neon / Supabase) if in production or DATABASE_URL provided without USE_LOCAL_DB
        if (!useLocalDb && dbUrl) {
          const useSsl =
            config.get<string>('DB_SSL') === 'true' ||
            isProd ||
            Boolean(
              dbUrl.includes('sslmode=require') ||
              dbUrl.includes('supabase') ||
              dbUrl.includes('neon.tech') ||
              dbUrl.includes('render.com'),
            );

          const sslConfig = useSsl ? { rejectUnauthorized: false } : false;

          return {
            type: 'postgres',
            url: dbUrl,
            ssl: sslConfig,
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
