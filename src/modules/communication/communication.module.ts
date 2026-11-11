import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { AuthModule } from '../auth/auth.module.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { CommunicationDelivery } from './entities/communication-delivery.entity.js';
import {
  CommunicationService,
  SMTP_TRANSPORT_FACTORY,
  type SmtpTransport,
} from './communication.service.js';
import { CommunicationController } from './communication.controller.js';
import { InternalCommunicationController } from './internal-communication.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommunicationDelivery, FollowUpExecution, LeadFollowUpEnrollment]),
    AuthModule,
  ],
  controllers: [
    CommunicationController,
    InternalCommunicationController,
  ],
  providers: [
    CommunicationService,
    N8nAuthGuard,
    {
      provide: SMTP_TRANSPORT_FACTORY,
      useFactory: () =>
        (options: Record<string, unknown>): SmtpTransport => {
          const transporter = nodemailer.createTransport(options);
          return {
            sendMail: (message) => transporter.sendMail(message),
            close: () => transporter.close(),
          };
        },
    },
  ],
  exports: [CommunicationService],
})
export class CommunicationModule {}
