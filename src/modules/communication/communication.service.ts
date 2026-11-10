import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { isEmail } from 'class-validator';
import { Repository } from 'typeorm';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SendCommunicationDto } from './dto/send-communication.dto.js';
import { CommunicationDelivery } from './entities/communication-delivery.entity.js';
import { isPostgresUniqueViolation } from '../../common/utils/idempotency.util.js';

export interface SendCommunicationResult {
  success: boolean;
  providerMessageId: string | null;
  error: string | null;
  retryable: boolean;
  simulated?: boolean;
  idempotencyStatus?: 'new' | 'replayed' | 'conflict';
}

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CommunicationDelivery)
    private readonly deliveriesRepository: Repository<CommunicationDelivery>,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: this.configService.get<boolean>('SMTP_SECURE', false),
        auth: { user, pass },
        connectionTimeout: this.configService.get<number>(
          'SMTP_CONNECTION_TIMEOUT_MS',
          10000,
        ),
        greetingTimeout: this.configService.get<number>(
          'SMTP_GREETING_TIMEOUT_MS',
          10000,
        ),
        socketTimeout: this.configService.get<number>(
          'SMTP_SOCKET_TIMEOUT_MS',
          20000,
        ),
      });
    }
  }

  async send(dto: SendCommunicationDto): Promise<SendCommunicationResult> {
    this.validateRequest(dto);
    const idempotencyKey = dto.idempotencyKey.trim();
    const payloadHash = this.hashPayload(dto);
    const existing = await this.findDelivery(idempotencyKey);
    if (existing) {
      return this.handleExistingDelivery(existing, dto, payloadHash);
    }

    const delivery = this.deliveriesRepository.create({
      idempotencyKey,
      payloadHash,
      status: 'PENDING',
      providerMessageId: null,
      error: null,
      retryable: false,
      simulated: false,
    });
    try {
      await this.deliveriesRepository.save(delivery);
    } catch (error) {
      if (!isPostgresUniqueViolation(error)) {
        throw error;
      }
      const concurrentDelivery = await this.findDelivery(idempotencyKey);
      if (!concurrentDelivery) {
        throw error;
      }
      return this.handleExistingDelivery(concurrentDelivery, dto, payloadHash);
    }

    return this.performDelivery(delivery, dto);
  }

  private async performDelivery(
    delivery: CommunicationDelivery,
    dto: SendCommunicationDto,
  ): Promise<SendCommunicationResult> {
    const result = await this.doSend(dto);
    delivery.status = result.success ? 'SUCCEEDED' : 'FAILED';
    delivery.providerMessageId = result.providerMessageId;
    delivery.error = result.error;
    delivery.retryable = result.retryable;
    delivery.simulated = result.simulated ?? false;
    await this.deliveriesRepository.save(delivery);
    return { ...result, idempotencyStatus: 'new' };
  }

  private async doSend(
    dto: SendCommunicationDto,
  ): Promise<SendCommunicationResult> {
    let result: SendCommunicationResult;

    if (!this.transporter) {
      this.logger.warn('SMTP configuration is incomplete; no email was sent');
      result = {
        success: false,
        providerMessageId: null,
        error: 'SMTP is not configured; no email was sent',
        retryable: false,
        simulated: true,
      };
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
        const code = this.getErrorCode(error);
        const retryable = this.isRetryable(code);
        const message = this.getSafeErrorMessage(code);
        this.logger.error(`SMTP delivery failed (${code ?? 'UNKNOWN'})`);
        result = {
          success: false,
          providerMessageId: null,
          error: message,
          retryable,
        };
      }
    }

    return result;
  }

  private hashPayload(dto: SendCommunicationDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          to: dto.to,
          subject: dto.subject,
          text: dto.text,
          html: dto.html,
        }),
      )
      .digest('hex');
  }

  private async findDelivery(
    idempotencyKey: string,
  ): Promise<CommunicationDelivery | null> {
    return this.deliveriesRepository.findOne({ where: { idempotencyKey } });
  }

  private async handleExistingDelivery(
    delivery: CommunicationDelivery,
    dto: SendCommunicationDto,
    payloadHash: string,
  ): Promise<SendCommunicationResult> {
    if (delivery.payloadHash !== payloadHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different communication payload',
      );
    }

    if (delivery.status === 'FAILED' && delivery.retryable) {
      const claim = await this.deliveriesRepository.update(
        { id: delivery.id, status: 'FAILED', retryable: true },
        {
          status: 'PENDING',
          retryable: false,
          error: null,
          providerMessageId: null,
          simulated: false,
        },
      );
      if (claim.affected === 1) {
        delivery.status = 'PENDING';
        delivery.retryable = false;
        delivery.error = null;
        delivery.providerMessageId = null;
        delivery.simulated = false;
        return this.performDelivery(delivery, dto);
      }
      const current = await this.findDelivery(delivery.idempotencyKey);
      if (current) {
        return this.resultFromDelivery(current);
      }
    }

    return this.resultFromDelivery(delivery);
  }

  private resultFromDelivery(
    delivery: CommunicationDelivery,
  ): SendCommunicationResult {
    if (delivery.status === 'SUCCEEDED') {
      return {
        success: true,
        providerMessageId: delivery.providerMessageId,
        error: null,
        retryable: false,
        simulated: delivery.simulated,
        idempotencyStatus: 'replayed',
      };
    }
    return {
      success: false,
      providerMessageId: delivery.providerMessageId,
      error:
        delivery.error ??
        'A delivery with this idempotency key is already in progress; refusing to send again',
      retryable: delivery.status === 'FAILED' && delivery.retryable,
      simulated: delivery.simulated,
      idempotencyStatus: 'replayed',
    };
  }

  private validateRequest(dto: SendCommunicationDto): void {
    if (!isEmail(dto.to)) {
      throw new BadRequestException('A valid recipient email is required');
    }
    if (!dto.subject?.trim()) {
      throw new BadRequestException('Email subject is required');
    }
    if (!dto.html?.trim() && !dto.text?.trim()) {
      throw new BadRequestException('Email content is required');
    }
    if (!dto.idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency key is required');
    }
    if (dto.idempotencyKey.length > 200) {
      throw new BadRequestException(
        'Idempotency key must be at most 200 characters',
      );
    }
  }

  private getErrorCode(error: unknown): string | null {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code.toUpperCase();
    }
    return null;
  }

  private getSafeErrorMessage(code: string | null): string {
    if (code === 'EAUTH') return 'SMTP authentication failed';
    if (code === 'ETIMEDOUT')
      return 'SMTP timed out; delivery outcome is unknown';
    if (code === 'ECONNREFUSED') return 'SMTP connection was refused';
    if (code === 'ENOTFOUND') return 'SMTP host could not be resolved';
    return 'SMTP delivery failed';
  }

  private isRetryable(code: string | null): boolean {
    return code === 'ECONNREFUSED' || code === 'ENOTFOUND';
  }
}
