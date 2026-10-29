import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { SendCommunicationDto } from './dto/send-communication.dto.js';

export interface SendCommunicationResult {
  success: boolean;
  providerMessageId: string | null;
  error: string | null;
  retryable: boolean;
  simulated?: boolean;
  idempotencyStatus?: 'new' | 'replayed' | 'conflict';
}

interface IdempotencyRecord {
  key: string;
  payloadHash: string;
  result: SendCommunicationResult;
  createdAt: number;
}

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly isProd: boolean;
  private readonly idempotencyStore = new Map<string, IdempotencyRecord>();
  private readonly inFlight = new Map<
    string,
    Promise<SendCommunicationResult>
  >();

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: this.configService.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async send(dto: SendCommunicationDto): Promise<SendCommunicationResult> {
    const key = dto.idempotencyKey;
    if (key) {
      const existing = this.idempotencyStore.get(key);
      if (existing) {
        if (existing.payloadHash !== this.hashPayload(dto)) {
          return {
            success: false,
            providerMessageId: null,
            error: 'Idempotency key reused with different payload',
            retryable: false,
            idempotencyStatus: 'conflict',
          };
        }
        return { ...existing.result, idempotencyStatus: 'replayed' };
      }

      const inFlightPromise = this.inFlight.get(key);
      if (inFlightPromise) {
        return inFlightPromise;
      }
    }

    const promise = this.doSend(dto, key);
    if (key) {
      this.inFlight.set(key, promise);
    }

    try {
      const result = await promise;
      return result;
    } finally {
      if (key) {
        this.inFlight.delete(key);
      }
    }
  }

  private async doSend(
    dto: SendCommunicationDto,
    key: string | undefined,
  ): Promise<SendCommunicationResult> {
    let result: SendCommunicationResult;

    if (!this.transporter) {
      if (this.isProd) {
        result = {
          success: false,
          providerMessageId: null,
          error: 'SMTP not configured in production',
          retryable: false,
          simulated: false,
        };
      } else {
        this.logger.warn(
          'SMTP not configured, simulating send (NOT a real delivery)',
        );
        result = {
          success: true,
          providerMessageId: `sim-${Date.now()}`,
          error: null,
          retryable: false,
          simulated: true,
        };
      }
    } else {
      try {
        const info = await this.transporter.sendMail({
          from: this.configService.get<string>(
            'SMTP_FROM',
            'no-reply@crm.local',
          ),
          to: dto.to,
          subject: dto.subject,
          html: dto.html,
          text: dto.text,
        });

        result = {
          success: true,
          providerMessageId: info.messageId ?? null,
          error: null,
          retryable: false,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = this.isRetryable(message);
        this.logger.error(`Failed to send email: ${message}`);
        result = {
          success: false,
          providerMessageId: null,
          error: message,
          retryable,
        };
      }
    }

    if (key) {
      this.idempotencyStore.set(key, {
        key,
        payloadHash: this.hashPayload(dto),
        result,
        createdAt: Date.now(),
      });
    }

    return { ...result, idempotencyStatus: 'new' };
  }

  private hashPayload(dto: SendCommunicationDto): string {
    return JSON.stringify({
      to: dto.to,
      subject: dto.subject,
      text: dto.text,
      html: dto.html,
    });
  }

  private isRetryable(message: string): boolean {
    const retryablePatterns = [
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'timeout',
      '421',
      '450',
      '451',
      '452',
    ];
    return retryablePatterns.some((p) =>
      message.toLowerCase().includes(p.toLowerCase()),
    );
  }
}
