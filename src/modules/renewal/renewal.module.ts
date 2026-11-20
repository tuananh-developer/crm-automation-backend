import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { CustomerTask } from '../customers/entities/customer-task.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import {
  RENEWAL_MAIL_TRANSPORT,
  RenewalService,
  type RenewalMailTransport,
} from './renewal.service.js';
import { RenewalController } from './renewal.controller.js';
import { CustomerContractsController } from './customer-contracts.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RenewalAuthGuard } from './guards/renewal-auth.guard.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CommunicationModule } from '../communication/communication.module.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Contract,
      RenewalDraft,
      Customer,
      CustomerTask,
      AuditLog,
    ]),
    NotificationsModule,
    CommunicationModule,
  ],
  controllers: [RenewalController, CustomerContractsController],
  providers: [
    RenewalService,
    N8nAuthGuard,
    JwtAuthGuard,
    RenewalAuthGuard,
    {
      provide: RENEWAL_MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RenewalMailTransport => ({
        sendMail: async (message) => {
          const host = config.get<string>('SMTP_HOST')?.trim();
          const from =
            config.get<string>('SMTP_FROM_EMAIL')?.trim() || message.from;
          if (!host || !from) {
            throw new Error('SMTP_TRANSPORT_NOT_CONFIGURED');
          }
          const portValue = config.get<string>('SMTP_PORT');
          const port = portValue ? Number(portValue) : 587;
          const user = config.get<string>('SMTP_USER');
          const pass = config.get<string>('SMTP_PASS');
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure: config.get<string>('SMTP_SECURE') === 'true',
            ...(user && pass ? { auth: { user, pass } } : {}),
          });
          try {
            return await transporter.sendMail({
              ...message,
              from,
            });
          } finally {
            transporter.close();
          }
        },
      }),
    },
  ],
  exports: [RenewalService],
})
export class RenewalModule {}
