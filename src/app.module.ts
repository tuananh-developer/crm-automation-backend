import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RabbitMQModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL');
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const useSsl =
          config.get<string>('DB_SSL') === 'true' ||
          isProd ||
          Boolean(
            dbUrl &&
            (dbUrl.includes('sslmode=require') ||
              dbUrl.includes('supabase') ||
              dbUrl.includes('neon.tech') ||
              dbUrl.includes('render.com')),
          );

        const sslConfig = useSsl ? { rejectUnauthorized: false } : false;

        if (dbUrl) {
          return {
            type: 'postgres',
            url: dbUrl,
            ssl: sslConfig,
            autoLoadEntities: true,
            synchronize: false,
          };
        }

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          ssl: sslConfig,
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
