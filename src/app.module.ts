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
import { AuditModule } from './modules/audit/audit.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false,
      }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
